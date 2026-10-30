import { afterEach, describe, expect, it, vi } from "vitest";
import { dedupeListings, searchConcerts } from "./index";
import { toListing } from "./seatgeek";
import type { ConcertListing } from "./types";

const listing = (overrides: Partial<ConcertListing>): ConcertListing => ({
  source: "ticketmaster",
  sourceId: "1",
  name: "Phoebe Bridgers",
  artists: ["Phoebe Bridgers"],
  venue: "Moody Center",
  city: "Austin",
  country: "US",
  startsAt: "2026-12-05T02:00:00Z",
  url: null,
  imageUrl: null,
  status: "onsale",
  ...overrides,
});

describe("SeatGeek toListing", () => {
  it("maps an event, primary performer first", () => {
    const l = toListing({
      id: 6123,
      title: "Phoebe Bridgers with Julien Baker",
      url: "https://seatgeek.com/e/6123",
      datetime_utc: "2026-12-05T02:00:00",
      status: "normal",
      venue: { name: "Moody Center", city: "Austin", country: "US" },
      performers: [
        { name: "Julien Baker", image: null },
        { name: "Phoebe Bridgers", image: "https://img/pb.jpg", primary: true },
      ],
    });
    expect(l).toMatchObject({
      source: "seatgeek",
      sourceId: "6123",
      artists: ["Phoebe Bridgers", "Julien Baker"],
      startsAt: "2026-12-05T02:00:00Z",
      imageUrl: "https://img/pb.jpg",
      city: "Austin",
    });
  });

  it("drops placeholder dates", () => {
    expect(toListing({ id: 1, title: "TBD show", datetime_utc: "2026-12-31T03:30:00", datetime_tbd: true }).startsAt).toBeNull();
  });
});

describe("dedupeListings", () => {
  it("keeps one listing per show, preferring the earlier source", () => {
    const result = dedupeListings([
      listing({}),
      listing({ source: "seatgeek", sourceId: "6123", name: "Phoebe Bridgers with Julien Baker", city: "AUSTIN" }),
      listing({ source: "seatgeek", sourceId: "7000", startsAt: "2026-12-06T02:00:00Z" }),
    ]);
    expect(result.map((l) => `${l.source}:${l.sourceId}`)).toEqual(["ticketmaster:1", "seatgeek:7000"]);
  });

  it("never merges listings without a date", () => {
    expect(dedupeListings([listing({ startsAt: null }), listing({ startsAt: null, sourceId: "2" })])).toHaveLength(2);
  });
});

describe("searchConcerts", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("skips a failing source", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "tm");
    vi.stubEnv("SEATGEEK_CLIENT_ID", "sg");
    vi.stubGlobal("fetch", async (url: string) =>
      url.includes("ticketmaster")
        ? new Response("down", { status: 503 })
        : Response.json({ events: [{ id: 9, title: "Show", datetime_utc: "2026-12-05T02:00:00", venue: { city: "Austin" } }] }),
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await searchConcerts({ keyword: "show" });
    expect(result.map((l) => l.source)).toEqual(["seatgeek"]);
  });

  it("requires at least one source", async () => {
    vi.stubEnv("TICKETMASTER_API_KEY", "");
    vi.stubEnv("SEATGEEK_CLIENT_ID", "");
    await expect(searchConcerts({})).rejects.toThrow(/No concert source/);
  });
});
