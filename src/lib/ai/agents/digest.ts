import { Agent } from "@strands-agents/sdk";
import { createModel } from "@/lib/ai/model";
import { DigestResult } from "@/lib/ai/schemas";
import { agentTraceAttributes, type TraceContext } from "@/lib/telemetry";

const SYSTEM_PROMPT = `You write a short daily email digest for a music fan about the concerts they follow.
Group by concert, soonest first, with a countdown ("in 12 days"). Lead with anything urgent (importance 3).
Each item is one line plus a markdown link to its source. Friendly, concise, no filler.
Return a subject line and the markdown body by calling the structured output tool.`;

export type DigestInput = {
  displayName: string | null;
  events: {
    name: string;
    startsAt: string | null;
    venue: string | null;
    city: string | null;
    updates: { kind: string; importance: number; title: string; summary: string; url: string | null }[];
  }[];
};

export async function writeDigest(input: DigestInput, ctx: TraceContext): Promise<DigestResult> {
  const agent = new Agent({
    name: "digest-agent",
    model: createModel({ effort: "low" }),
    systemPrompt: SYSTEM_PROMPT,
    structuredOutputSchema: DigestResult,
    traceAttributes: agentTraceAttributes(ctx),
    printer: false,
  });
  const result = await agent.invoke(
    `Today: ${new Date().toISOString().slice(0, 10)}\n\n${JSON.stringify(input, null, 2)}`,
  );
  return DigestResult.parse(result.structuredOutput);
}
