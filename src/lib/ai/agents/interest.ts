import { Agent } from "@strands-agents/sdk";
import { createModel } from "@/lib/ai/model";
import { InterestProfile } from "@/lib/ai/schemas";
import { agentTraceAttributes, type TraceContext } from "@/lib/telemetry";

const SYSTEM_PROMPT = `You turn a music fan's description of their taste into a structured interest profile used to find concerts.
Extract named artists exactly as written. Infer genres from the artists when the user does not list any.
Leave fields null when the user gave no information; do not guess a home city.
Return your answer by calling the structured output tool.`;

export async function parseInterests(rawText: string, ctx: TraceContext): Promise<InterestProfile> {
  const agent = new Agent({
    name: "interest-agent",
    model: createModel({ effort: "low" }),
    systemPrompt: SYSTEM_PROMPT,
    structuredOutputSchema: InterestProfile,
    traceAttributes: agentTraceAttributes(ctx),
    printer: false,
  });
  const result = await agent.invoke(rawText);
  return InterestProfile.parse(result.structuredOutput);
}
