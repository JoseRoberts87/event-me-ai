import { Inngest } from "inngest";

export const inngest = new Inngest({ id: "event-me-ai" });

export const EVENTS = {
  trackRequested: "concert/track.requested",
} as const;
