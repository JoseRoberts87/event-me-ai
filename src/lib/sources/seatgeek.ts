import { withSpan } from "@/lib/telemetry";
import type { ConcertListing, ConcertSearch } from "./types";

const BASE_URL = "https://api.seatgeek.com/2";

type SgEvent = {
  id: number;
  title: string;
  short_title?: string;
  url?: string;
  datetime_utc?: string;
  datetime_tbd?: boolean;
  status?: string;
  venue?: { name?: string; city?: string; country?: string };
  performers?: { name: string; image?: string | null; primary?: boolean }[];
};

export function toListing(e: SgEvent): ConcertListing {
  const performers = [...(e.performers ?? [])].sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  return {
    source: "seatgeek",
    sourceId: String(e.id),
    name: e.title,
    artists: performers.map((p) => p.name),
    venue: e.venue?.name ?? null,
    city: e.venue?.city ?? null,
    country: e.venue?.country ?? null,
    // datetime_utc has no zone suffix; TBD dates are placeholders.
    startsAt: e.datetime_utc && !e.datetime_tbd ? `${e.datetime_utc}Z` : null,
    url: e.url ?? null,
    imageUrl: performers.find((p) => p.image)?.image ?? null,
    status: e.status ?? "normal",
  };
}

/** Searches SeatGeek for concerts. */
export async function searchSeatGeek(query: ConcertSearch): Promise<ConcertListing[]> {
  const clientId = process.env.SEATGEEK_CLIENT_ID;
  if (!clientId) throw new Error("SEATGEEK_CLIENT_ID is not set");

  const params = new URLSearchParams({
    client_id: clientId,
    "taxonomies.name": "concert",
    sort: "datetime_utc.asc",
    per_page: String(query.size ?? 20),
    "datetime_utc.gte": query.startDate ?? new Date().toISOString().slice(0, 10),
  });
  if (query.keyword) params.set("q", query.keyword);
  if (query.city) params.set("venue.city", query.city);
  if (query.countryCode) params.set("venue.country", query.countryCode);

  return withSpan("source.seatgeek.search", {}, async (span) => {
    span.setAttribute("source.query", query.keyword ?? "");
    const res = await fetch(`${BASE_URL}/events?${params}`);
    if (!res.ok) throw new Error(`SeatGeek ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { events?: SgEvent[] };
    const listings = (body.events ?? []).map(toListing);
    span.setAttribute("source.results", listings.length);
    return listings;
  });
}
