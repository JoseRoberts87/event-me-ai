import { context, propagation, SpanStatusCode, trace, type Attributes, type Span } from "@opentelemetry/api";
import { ATTR, traceAttributes, type TraceContext } from "./attributes";

export type { TraceContext } from "./attributes";

const tracer = trace.getTracer("event-me-ai");

/**
 * Runs `fn` inside a span. Correlation ids become baggage, so Strands agent,
 * model and tool spans created inside `fn` inherit them as attributes.
 * The outermost span also names the Langfuse trace and flushes on completion,
 * since serverless functions can freeze before the batch exporter runs.
 */
export async function withSpan<T>(
  name: string,
  ctx: TraceContext,
  fn: (span: Span) => Promise<T>,
  attributes: Attributes = {},
): Promise<T> {
  const isRoot = !trace.getActiveSpan();
  const entries = traceAttributes(ctx);
  if (isRoot) entries[ATTR.traceName] = name;

  let baggage = propagation.getBaggage(context.active()) ?? propagation.createBaggage();
  for (const [key, value] of Object.entries(entries)) {
    baggage = baggage.setEntry(key, { value });
  }
  const parent = propagation.setBaggage(context.active(), baggage);

  try {
    return await tracer.startActiveSpan(name, { attributes: { ...entries, ...attributes } }, parent, async (span) => {
      try {
        return await fn(span);
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
  } finally {
    if (isRoot && process.env.NEXT_RUNTIME === "nodejs") {
      const { flushTelemetry } = await import("./setup");
      await flushTelemetry().catch((err) => console.error("Failed to flush traces", err));
    }
  }
}

/** Strands `traceAttributes` for an agent, so its spans carry the same ids. */
export function agentTraceAttributes(ctx: TraceContext): Record<string, string> {
  return traceAttributes(ctx);
}
