import { Agent, tool } from "@strands-agents/sdk";
import { z } from "zod";
import { createModel } from "@/lib/ai/model";
import { DiscoveryResult, type InterestProfile } from "@/lib/ai/schemas";
import { searchConcerts, type ConcertListing } from "@/lib/sources";
import { agentTraceAttributes, type TraceContext } from "@/lib/telemetry";

const SYSTEM_PROMPT = `You find upcoming concerts that match a music fan's interest profile.
Use search_concerts with focused queries: one per artist, plus genre keywords near the user's city.
Only recommend concerts returned by search_concerts, referencing their exact id.
Prefer shows near the user unless they are willing to travel. Return at most 15 matches, best first,
by calling the structured output tool.`;

export type DiscoveredConcert = ConcertListing & { reason: string; score: number };

export async function discoverConcerts(profile: InterestProfile, ctx: TraceContext): Promise<DiscoveredConcert[]> {
  // Every listing the agent has seen, keyed by "source:sourceId"; matches are
  // resolved against this so ids can't be invented.
  const seen = new Map<string, ConcertListing>();
  const keyOf = (l: ConcertListing) => `${l.source}:${l.sourceId}`;

  const searchTool = tool({
    name: "search_concerts",
    description: "Search ticketing sites for upcoming concerts. Returns id, name, artists, venue, city and date.",
    inputSchema: z.object({
      keyword: z.string().describe("Artist name or genre keyword"),
      city: z.string().optional(),
      countryCode: z.string().optional(),
      radiusMiles: z.number().optional(),
    }),
    callback: async (input) => {
      const listings = await searchConcerts({ ...input, size: 20 });
      for (const l of listings) seen.set(keyOf(l), l);
      return JSON.stringify(
        listings.map((l) => ({ id: keyOf(l), name: l.name, artists: l.artists, venue: l.venue, city: l.city, startsAt: l.startsAt })),
      );
    },
  });

  const agent = new Agent({
    name: "discovery-agent",
    model: createModel({ effort: "medium" }),
    systemPrompt: SYSTEM_PROMPT,
    tools: [searchTool],
    structuredOutputSchema: DiscoveryResult,
    traceAttributes: agentTraceAttributes(ctx),
    printer: false,
  });

  const result = await agent.invoke(`Interest profile:\n${JSON.stringify(profile, null, 2)}`);
  const { matches } = DiscoveryResult.parse(result.structuredOutput);

  return matches.flatMap((m) => {
    const listing = seen.get(m.id);
    return listing ? [{ ...listing, reason: m.reason, score: m.score }] : [];
  });
}
