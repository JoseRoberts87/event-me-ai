import "server-only";
import { trackEvent } from "@/lib/ai/agents/tracker";
import { isDueForTracking } from "@/lib/cadence";
import { createAdminClient } from "@/lib/supabase/admin";
import { withSpan } from "@/lib/telemetry";

/** Ids of followed, upcoming concerts whose tracking interval has elapsed. */
export async function findDueEventIds(now = new Date()): Promise<string[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from("events")
    .select("id, starts_at, last_tracked_at, follows!inner(user_id)")
    .eq("status", "scheduled");
  if (error) throw error;

  const ids = new Set<string>();
  for (const e of data) {
    const startsAt = e.starts_at ? new Date(e.starts_at) : null;
    const last = e.last_tracked_at ? new Date(e.last_tracked_at) : null;
    if (isDueForTracking(startsAt, last, now)) ids.add(e.id);
  }
  return [...ids];
}

/** Runs the tracker agent for one concert and stores any new updates. */
export async function trackConcert(eventId: string) {
  return withSpan("tracking.concert", { eventId, job: "track-event" }, async (span) => {
    const db = createAdminClient();
    const { data: event, error } = await db.from("events").select("*").eq("id", eventId).single();
    if (error) throw error;

    const { data: recent } = await db
      .from("updates")
      .select("title, url")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false })
      .limit(50);

    const result = await trackEvent(
      {
        name: event.name,
        artists: event.artists,
        venue: event.venue,
        city: event.city,
        startsAt: event.starts_at,
        status: event.status,
      },
      recent ?? [],
      { eventId, job: "track-event" },
    );

    if (result.updates.length > 0) {
      const { error: insertError } = await db.from("updates").upsert(
        result.updates.map((u) => ({
          event_id: eventId,
          kind: u.kind,
          importance: u.importance,
          title: u.title,
          summary: u.summary,
          source_name: u.sourceName,
          url: u.url,
          published_at: u.publishedAt,
        })),
        { onConflict: "event_id,url", ignoreDuplicates: true },
      );
      if (insertError) throw insertError;
    }

    await db
      .from("events")
      .update({ last_tracked_at: new Date().toISOString(), ...(result.statusChange && { status: result.statusChange }) })
      .eq("id", eventId);

    span.setAttribute("tracking.updates_found", result.updates.length);
    return { updates: result.updates.length, statusChange: result.statusChange };
  });
}
