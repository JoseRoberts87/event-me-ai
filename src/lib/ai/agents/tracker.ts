import { Agent } from "@strands-agents/sdk";
import { createModel } from "@/lib/ai/model";
import { TrackerResult } from "@/lib/ai/schemas";
import { agentTraceAttributes, type TraceContext } from "@/lib/telemetry";

const SYSTEM_PROMPT = `You follow one upcoming concert and report what changed since the last check.
Search the web for news, announcements, social posts and fan discussion about this specific show and the tour it belongs to:
support acts, set times, setlists from recent tour dates, ticket drops or presales, venue/logistics info, and any postponement or cancellation.
Rules:
- Only report items you found in search results, with their real URL.
- Skip anything already listed under "Already reported".
- Skip generic or evergreen content (artist bios, unrelated tours).
- importance 3 is reserved for changes a ticket holder must act on (date/venue change, cancellation, presale opening).
- Return an empty list if nothing new turned up. Call the structured output tool with your result.`;

export type TrackedEvent = {
  name: string;
  artists: string[];
  venue: string | null;
  city: string | null;
  startsAt: string | null;
  status: string;
};

export async function trackEvent(
  event: TrackedEvent,
  alreadyReported: { title: string; url: string | null }[],
  ctx: TraceContext,
): Promise<TrackerResult> {
  const agent = new Agent({
    name: "tracker-agent",
    model: createModel({ effort: "medium", webSearch: { maxUses: 6 } }),
    systemPrompt: SYSTEM_PROMPT,
    structuredOutputSchema: TrackerResult,
    traceAttributes: agentTraceAttributes(ctx),
    printer: false,
  });

  const prompt = [
    `Today: ${new Date().toISOString().slice(0, 10)}`,
    `Concert: ${JSON.stringify(event)}`,
    `Already reported:\n${alreadyReported.map((u) => `- ${u.title} (${u.url ?? "no url"})`).join("\n") || "(none)"}`,
  ].join("\n\n");

  const result = await agent.invoke(prompt);
  return TrackerResult.parse(result.structuredOutput);
}
