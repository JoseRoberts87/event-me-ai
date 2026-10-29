import { describe, expect, it } from "vitest";
import { isDueForTracking, trackingIntervalMs } from "./cadence";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const now = new Date("2026-11-01T12:00:00Z");
const inDays = (d: number) => new Date(now.getTime() + d * DAY);

describe("trackingIntervalMs", () => {
  it("scales with proximity to the show", () => {
    expect(trackingIntervalMs(inDays(90), now)).toBe(7 * DAY);
    expect(trackingIntervalMs(inDays(30), now)).toBe(DAY);
    expect(trackingIntervalMs(inDays(3), now)).toBe(6 * HOUR);
    expect(trackingIntervalMs(inDays(0.5), now)).toBe(HOUR);
  });

  it("stops after the show has passed", () => {
    expect(trackingIntervalMs(inDays(-2), now)).toBeNull();
  });

  it("checks weekly when the date is unknown", () => {
    expect(trackingIntervalMs(null, now)).toBe(7 * DAY);
  });
});

describe("isDueForTracking", () => {
  it("is due when never tracked", () => {
    expect(isDueForTracking(inDays(30), null, now)).toBe(true);
  });

  it("respects the interval", () => {
    expect(isDueForTracking(inDays(30), new Date(now.getTime() - 2 * HOUR), now)).toBe(false);
    expect(isDueForTracking(inDays(30), new Date(now.getTime() - 25 * HOUR), now)).toBe(true);
  });

  it("is never due for past shows", () => {
    expect(isDueForTracking(inDays(-3), null, now)).toBe(false);
  });
});
