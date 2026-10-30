export type ConcertSource = "ticketmaster" | "seatgeek";

export type ConcertListing = {
  source: ConcertSource;
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
