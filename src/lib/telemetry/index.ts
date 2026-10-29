import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
} from "@opentelemetry/api";

const tracer = trace.getTracer("event-me-ai");

/** Correlation ids carried as baggage and stamped onto every child span. */
export type TraceContext = {
  userId?: string;
  eventId?: string;
  job?: string;
};

function toBaggage(ctx: TraceContext): Record<string, string> {
  const entries: Record<string, string> = {};
  if (ctx.userId) entries["app.user.id"] = ctx.userId;
  if (ctx.eventId) entries["app.event.id"] = ctx.eventId;
  if (ctx.job) entries["app.job.name"] = ctx.job;
  return entries;
}

/**
 * Runs `fn` inside a span. Correlation ids become baggage, so Strands agent,
 * model and tool spans created inside `fn` inherit them as attributes.
 */
export async function withSpan<T>(
  name: string,
  ctx: TraceContext,
  fn: (span: Span) => Promise<T>,
  attributes: Attributes = {},
): Promise<T> {
  let baggage = propagation.getBaggage(context.active()) ?? propagation.createBaggage();
  for (const [key, value] of Object.entries(toBaggage(ctx))) {
    baggage = baggage.setEntry(key, { value });
  }
  const parent = propagation.setBaggage(context.active(), baggage);

  return tracer.startActiveSpan(name, { attributes: { ...toBaggage(ctx), ...attributes } }, parent, async (span) => {
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
}

/** Strands `traceAttributes` for an agent, so its spans are filterable by these ids. */
export function agentTraceAttributes(ctx: TraceContext): Record<string, string> {
  return toBaggage(ctx);
}
