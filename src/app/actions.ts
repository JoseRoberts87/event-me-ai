"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { discoverConcerts } from "@/lib/ai/agents/discovery";
import { parseInterests } from "@/lib/ai/agents/interest";
import { InterestProfile } from "@/lib/ai/schemas";
import { EVENTS, inngest } from "@/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requireUser } from "@/lib/supabase/server";
import { withSpan } from "@/lib/telemetry";

export type FormState = { error?: string; message?: string };

async function siteUrl() {
  const h = await headers();
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: `${await siteUrl()}/auth/callback` },
  });
  if (error) return { error: "We couldn't sign you in. Invite-only: ask for an invite if you don't have an account." };
  return { message: "Check your email for a sign-in link." };
}

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").trim();
  const db = createAdminClient();

  const { data: invite } = await db.from("invites").select("*").eq("code", code).maybeSingle();
  const invalid =
    !invite ||
    invite.used_by ||
    (invite.expires_at && new Date(invite.expires_at) < new Date()) ||
    (invite.email && invite.email.toLowerCase() !== email);
  if (invalid) return { error: "That invite code isn't valid." };

  const { data, error } = await db.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/onboarding`,
  });
  if (error || !data.user) return { error: "Couldn't create your account. You may already have one — try signing in." };

  // Claim the invite only if it is still unused (guards against concurrent redemption).
  const { data: claimed } = await db
    .from("invites")
    .update({ used_by: data.user.id, used_at: new Date().toISOString() })
    .eq("code", code)
    .is("used_by", null)
    .select("code");
  if (!claimed?.length) {
    await db.auth.admin.deleteUser(data.user.id);
    return { error: "That invite code isn't valid." };
  }
  return { message: "Invite accepted. Check your email to finish signing up." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function saveInterests(_: FormState, form: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const rawText = String(form.get("interests") ?? "").trim();
  const city = String(form.get("city") ?? "").trim();
  if (!rawText) return { error: "Tell us a bit about what you like to see live." };

  const text = city ? `${rawText}\n\nI live in ${city}.` : rawText;
  const structured = await withSpan("action.save-interests", { userId: user.id }, () =>
    parseInterests(text, { userId: user.id }),
  );
  const { error } = await supabase.from("interests").insert({ user_id: user.id, raw_text: text, structured });
  if (error) return { error: error.message };
  if (city) await supabase.from("profiles").update({ home_city: city }).eq("user_id", user.id);
  redirect("/discover");
}

export type DiscoverState = {
  error?: string;
  concerts?: {
    id: string;
    name: string;
    venue: string | null;
    city: string | null;
    startsAt: string | null;
    reason: string;
    followed: boolean;
  }[];
};

export async function discover(): Promise<DiscoverState> {
  const { supabase, user } = await requireUser();
  const { data: interests } = await supabase
    .from("interests")
    .select("structured")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  if (!interests?.length) return { error: "Add your interests first." };

  const profile = InterestProfile.parse(interests[0].structured);
  const found = await withSpan("action.discover", { userId: user.id }, () =>
    discoverConcerts(profile, { userId: user.id }),
  );
  if (found.length === 0) return { concerts: [] };

  // Events are shared rows, written with the service role.
  const db = createAdminClient();
  const { data: rows, error } = await db
    .from("events")
    .upsert(
      found.map((c) => ({
        source: c.source,
        source_id: c.sourceId,
        name: c.name,
        artists: c.artists,
        venue: c.venue,
        city: c.city,
        country: c.country,
        starts_at: c.startsAt,
        url: c.url,
        image_url: c.imageUrl,
      })),
      { onConflict: "source,source_id" },
    )
    .select("id, source_id");
  if (error) return { error: error.message };

  const { data: follows } = await supabase.from("follows").select("event_id").eq("user_id", user.id);
  const followed = new Set(follows?.map((f) => f.event_id));
  const idBySource = new Map(rows.map((r) => [r.source_id, r.id]));

  return {
    concerts: found.map((c) => {
      const id = idBySource.get(c.sourceId)!;
      return { id, name: c.name, venue: c.venue, city: c.city, startsAt: c.startsAt, reason: c.reason, followed: followed.has(id) };
    }),
  };
}

export async function follow(eventId: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("follows").upsert({ user_id: user.id, event_id: eventId });
  if (error) throw error;
  // Start tracking right away; if Inngest is unreachable the hourly scheduler picks it up.
  try {
    await inngest.send({ name: EVENTS.trackRequested, data: { eventId } });
  } catch (err) {
    console.error("Failed to enqueue tracking", err);
  }
}

export async function unfollow(eventId: string) {
  const { supabase, user } = await requireUser();
  await supabase.from("follows").delete().eq("user_id", user.id).eq("event_id", eventId);
}
