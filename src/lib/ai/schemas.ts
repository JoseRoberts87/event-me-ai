import { z } from "zod";

export const InterestProfile = z.object({
  artists: z.array(z.string()).describe("Specific artists or bands the user named or clearly implied"),
  genres: z.array(z.string()).describe("Genres, scenes or styles"),
  city: z.string().nullable().describe("Home city for local shows, if stated"),
  countryCode: z.string().nullable().describe("ISO 3166-1 alpha-2 country code, if known"),
  radiusMiles: z.number().nullable().describe("How far the user will travel, if stated"),
  willTravel: z.boolean().describe("True if the user is open to shows outside their city"),
  notes: z.string().describe("Anything else relevant: venue size, budget, vibe"),
});
export type InterestProfile = z.infer<typeof InterestProfile>;

export const DiscoveryResult = z.object({
  matches: z.array(
    z.object({
      id: z.string().describe("The id exactly as returned by search_concerts"),
      reason: z.string().describe("One sentence on why this matches the user's interests"),
      score: z.number().min(0).max(1),
    }),
  ),
});
export type DiscoveryResult = z.infer<typeof DiscoveryResult>;

export const UpdateKind = z.enum(["news", "social", "lineup", "tickets", "logistics", "change", "setlist"]);

export const TrackerResult = z.object({
  updates: z.array(
    z.object({
      kind: UpdateKind,
      importance: z.number().int().min(1).max(3).describe("1 = nice to know, 2 = notable, 3 = fans must know now"),
      title: z.string(),
      summary: z.string().describe("2-3 sentences, factual, no hype"),
      sourceName: z.string(),
      url: z.string().describe("Source URL taken from search results; never invented"),
      publishedAt: z.string().nullable().describe("ISO date if known"),
    }),
  ),
  statusChange: z
    .enum(["scheduled", "postponed", "cancelled"])
    .nullable()
    .describe("Set only if a reliable source reports the show's status changed"),
});
export type TrackerResult = z.infer<typeof TrackerResult>;

export const DigestResult = z.object({
  subject: z.string(),
  markdown: z.string(),
});
export type DigestResult = z.infer<typeof DigestResult>;
