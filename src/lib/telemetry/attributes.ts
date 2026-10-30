/** Correlation ids for a unit of work (a job run or a user action). */
export type TraceContext = {
  userId?: string;
  eventId?: string;
  job?: string;
};

/** Span attribute keys Langfuse maps to trace fields. */
export const ATTR = {
  userId: "user.id",
  sessionId: "session.id",
  traceName: "langfuse.trace.name",
  eventId: "langfuse.trace.metadata.event_id",
  job: "langfuse.trace.metadata.job",
} as const;

export const TRACE_ATTRIBUTE_KEYS = new Set<string>(Object.values(ATTR));

/**
 * Maps correlation ids to Langfuse attributes. Each concert is a Langfuse
 * session, so every tracking run for a show is grouped together.
 */
export function traceAttributes(ctx: TraceContext): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (ctx.userId) attrs[ATTR.userId] = ctx.userId;
  if (ctx.eventId) {
    attrs[ATTR.sessionId] = `event:${ctx.eventId}`;
    attrs[ATTR.eventId] = ctx.eventId;
  }
  if (ctx.job) attrs[ATTR.job] = ctx.job;
  return attrs;
}
