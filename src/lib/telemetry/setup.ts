import { setupTracer } from "@strands-agents/sdk/telemetry";

let initialized = false;

/**
 * Registers the global OpenTelemetry tracer provider via Strands.
 * Strands agents pick it up automatically; our own spans (jobs, sources)
 * use the same provider through `@opentelemetry/api`.
 *
 * Config comes from standard OTel env vars: OTEL_SERVICE_NAME,
 * OTEL_EXPORTER_OTLP_ENDPOINT, OTEL_EXPORTER_OTLP_HEADERS.
 */
export function initTelemetry() {
  if (initialized) return;
  initialized = true;

  process.env.OTEL_SERVICE_NAME ??= "event-me-ai";

  setupTracer({
    exporters: {
      otlp: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
      console: process.env.OTEL_CONSOLE_EXPORTER === "true",
    },
    // Copy app.* baggage (user/event/job ids) onto every span, including
    // spans Strands creates for agent, model and tool calls.
    baggageProcessor: (key) => key.startsWith("app."),
  });
}
