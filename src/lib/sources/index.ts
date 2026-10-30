import { searchSeatGeek } from "./seatgeek";
import { searchTicketmaster } from "./ticketmaster";
import type { ConcertListing, ConcertSearch } from "./types";

export type { ConcertListing, ConcertSearch } from "./types";

/** Sources with credentials configured, in order of preference for duplicates. */
function enabledSources() {
  const sources: ((q: ConcertSearch) => Promise<ConcertListing[]>)[] = [];
  if (process.env.TICKETMASTER_API_KEY) sources.push(searchTicketmaster);
  if (process.env.SEATGEEK_CLIENT_ID) sources.push(searchSeatGeek);
  return sources;
}

const normalize = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** Same show listed by two sources: same headliner, city and local date. */
function dedupeKey(l: ConcertListing): string {
  return [normalize(l.artists[0] ?? l.name), normalize(l.city), l.startsAt?.slice(0, 10) ?? ""].join("|");
}

/** Keeps the first listing for each show; earlier sources win. */
export function dedupeListings(listings: ConcertListing[]): ConcertListing[] {
  const seen = new Set<string>();
  return listings.filter((l) => {
    if (!l.startsAt) return true;
    const key = dedupeKey(l);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Searches every configured source in parallel. A failing source is logged
 * and skipped so one outage doesn't break discovery.
 */
export async function searchConcerts(query: ConcertSearch): Promise<ConcertListing[]> {
  const sources = enabledSources();
  if (sources.length === 0) throw new Error("No concert source configured: set TICKETMASTER_API_KEY or SEATGEEK_CLIENT_ID");

  const results = await Promise.allSettled(sources.map((search) => search(query)));
  const listings: ConcertListing[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") listings.push(...r.value);
    else console.error("Concert source failed", r.reason);
  }
  if (listings.length === 0 && results.every((r) => r.status === "rejected")) {
    throw new Error("All concert sources failed");
  }
  return dedupeListings(listings);
}
