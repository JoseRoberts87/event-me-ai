import { withSpan } from "@/lib/telemetry";

const BASE_URL = "https://app.ticketmaster.com/discovery/v2";

export type ConcertListing = {
  source: "ticketmaster";
  sourceId: string;
  name: string;
  artists: string[];
  venue: string | null;
  city: string | null;
  country: string | null;
  startsAt: string | null;
  url: string | null;
  imageUrl: string | null;
  status: string;
};

export type ConcertSearch = {
  keyword?: string;
  city?: string;
  countryCode?: string;
  radiusMiles?: number;
  startDate?: string; // ISO date
  size?: number;
};

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  images?: { url: string; width: number }[];
  dates?: { start?: { dateTime?: string; localDate?: string }; status?: { code?: string } };
  _embedded?: {
    venues?: { name?: string; city?: { name?: string }; country?: { countryCode?: string } }[];
    attractions?: { name: string }[];
  };
};

function toListing(e: TmEvent): ConcertListing {
  const venue = e._embedded?.venues?.[0];
  const image = [...(e.images ?? [])].sort((a, b) => b.width - a.width)[0];
  return {
    source: "ticketmaster",
    sourceId: e.id,
    name: e.name,
    artists: e._embedded?.attractions?.map((a) => a.name) ?? [],
    venue: venue?.name ?? null,
    city: venue?.city?.name ?? null,
    country: venue?.country?.countryCode ?? null,
    startsAt: e.dates?.start?.dateTime ?? e.dates?.start?.localDate ?? null,
    url: e.url ?? null,
    imageUrl: image?.url ?? null,
    status: e.dates?.status?.code ?? "onsale",
  };
}

/** Searches Ticketmaster for music events. */
export async function searchConcerts(query: ConcertSearch): Promise<ConcertListing[]> {
  const apiKey = process.env.TICKETMASTER_API_KEY;
  if (!apiKey) throw new Error("TICKETMASTER_API_KEY is not set");

  const params = new URLSearchParams({
    apikey: apiKey,
    classificationName: "music",
    sort: "date,asc",
    size: String(query.size ?? 20),
  });
  if (query.keyword) params.set("keyword", query.keyword);
  if (query.city) params.set("city", query.city);
  if (query.countryCode) params.set("countryCode", query.countryCode);
  if (query.radiusMiles) {
    params.set("radius", String(query.radiusMiles));
    params.set("unit", "miles");
  }
  params.set("startDateTime", `${query.startDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);

  return withSpan("source.ticketmaster.search", {}, async (span) => {
    span.setAttribute("source.query", query.keyword ?? "");
    const res = await fetch(`${BASE_URL}/events.json?${params}`);
    if (!res.ok) throw new Error(`Ticketmaster ${res.status}: ${await res.text()}`);
    const body = (await res.json()) as { _embedded?: { events?: TmEvent[] } };
    const listings = (body._embedded?.events ?? []).map(toListing);
    span.setAttribute("source.results", listings.length);
    return listings;
  });
}
