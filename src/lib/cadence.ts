const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How often an event should be re-tracked, based on how close it is.
 * Far-off shows change rarely; the final week and show day change fast.
 */
export function trackingIntervalMs(startsAt: Date | null, now: Date = new Date()): number | null {
  if (!startsAt) return 7 * DAY;
  const untilShow = startsAt.getTime() - now.getTime();
  if (untilShow < -DAY) return null; // show is over; stop tracking
  if (untilShow <= DAY) return HOUR;
  if (untilShow <= 7 * DAY) return 6 * HOUR;
  if (untilShow <= 60 * DAY) return DAY;
  return 7 * DAY;
}

export function isDueForTracking(
  startsAt: Date | null,
  lastTrackedAt: Date | null,
  now: Date = new Date(),
): boolean {
  const interval = trackingIntervalMs(startsAt, now);
  if (interval === null) return false;
  if (!lastTrackedAt) return true;
  return now.getTime() - lastTrackedAt.getTime() >= interval;
}
