import "server-only";
import { Resend } from "resend";
import { writeDigest } from "@/lib/ai/agents/digest";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSpan } from "@/lib/telemetry";

const DAY = 24 * 60 * 60 * 1000;

export async function findDigestRecipients(): Promise<string[]> {
  const db = createAdminClient();
  const { data, error } = await db.from("profiles").select("user_id").eq("digest_enabled", true);
  if (error) throw error;
  return data.map((p) => p.user_id);
}

/** Builds and emails one user's daily digest. Skips users with nothing new. */
export async function sendDigest(userId: string) {
  return withSpan("digest.user", { userId, job: "daily-digest" }, async (span) => {
    const db = createAdminClient();
    const since = new Date(Date.now() - DAY).toISOString();

    const { data: follows, error } = await db
      .from("follows")
      .select("events(id, name, starts_at, venue, city, updates(kind, importance, title, summary, url, created_at))")
      .eq("user_id", userId)
      .gte("events.updates.created_at", since);
    if (error) throw error;

    const events = follows
      .flatMap((f) => (f.events ? [f.events].flat() : []))
      .filter((e) => e.updates.length > 0)
      .map((e) => ({ name: e.name, startsAt: e.starts_at, venue: e.venue, city: e.city, updates: e.updates }));

    span.setAttribute("digest.events", events.length);
    if (events.length === 0) return { sent: false };

    const [{ data: profile }, { data: authUser }] = await Promise.all([
      db.from("profiles").select("display_name").eq("user_id", userId).single(),
      db.auth.admin.getUserById(userId),
    ]);
    const email = authUser.user?.email;
    if (!email) return { sent: false };

    const digest = await writeDigest({ displayName: profile?.display_name ?? null, events }, { userId, job: "daily-digest" });

    await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: process.env.DIGEST_FROM_EMAIL ?? "Event Me AI <digest@example.com>",
      to: email,
      subject: digest.subject,
      text: digest.markdown,
    });
    await db.from("digests").insert({ user_id: userId, body_markdown: digest.markdown, sent_at: new Date().toISOString() });
    return { sent: true };
  });
}
