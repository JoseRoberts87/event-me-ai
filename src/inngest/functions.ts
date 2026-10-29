import { EVENTS, inngest } from "@/inngest/client";
import { findDigestRecipients, sendDigest } from "@/lib/services/digest";
import { findDueEventIds, trackConcert } from "@/lib/services/tracking";
import { withSpan } from "@/lib/telemetry";

/** Hourly: fan out a tracking run for every concert whose cadence interval elapsed. */
export const trackingScheduler = inngest.createFunction(
  { id: "tracking-scheduler", triggers: [{ cron: "0 * * * *" }] },
  async ({ step }) => {
    const ids = await step.run("find-due-events", () =>
      withSpan("job.tracking-scheduler", { job: "tracking-scheduler" }, () => findDueEventIds()),
    );
    if (ids.length > 0) {
      await step.sendEvent(
        "request-tracking",
        ids.map((eventId) => ({ name: EVENTS.trackRequested, data: { eventId } })),
      );
    }
    return { scheduled: ids.length };
  },
);

export const trackEventFn = inngest.createFunction(
  {
    id: "track-event",
    triggers: [{ event: EVENTS.trackRequested }],
    concurrency: { limit: 5 },
    retries: 2,
  },
  async ({ event, step }) => {
    const eventId = event.data.eventId as string;
    return step.run("track-concert", () => trackConcert(eventId));
  },
);

/** Daily at 14:00 UTC: one AI-written digest email per user with new updates. */
export const dailyDigest = inngest.createFunction(
  { id: "daily-digest", triggers: [{ cron: "0 14 * * *" }] },
  async ({ step }) => {
    const userIds = await step.run("find-recipients", () => findDigestRecipients());
    let sent = 0;
    for (const userId of userIds) {
      const result = await step.run(`digest-${userId}`, () => sendDigest(userId));
      if (result.sent) sent++;
    }
    return { sent };
  },
);

export const functions = [trackingScheduler, trackEventFn, dailyDigest];
