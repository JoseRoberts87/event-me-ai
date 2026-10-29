import { setupTracer } from "@strands-agents/sdk/telemetry";
import { TRACE_ATTRIBUTE_KEYS } from "./attributes";

let provider: { forceFlush(): Promise<void> } | null = null;

/**
 * Points the OTLP exporter at Langfuse when Langfuse keys are present and no
 * explicit OTEL_EXPORTER_OTLP_* settings were given.
 * See https://langfuse.com/integrations/native/opentelemetry
 */
export function configureLangfuseExporter() {
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = process.env;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) return;

  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com").replace(/\/$/, "");
  const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64");
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= `${baseUrl}/api/public/otel`;
  // Ingestion v4 makes traces show up in real time instead of after a delay.
  process.env.OTEL_EXPORTER_OTLP_HEADERS ??= `Authorization=Basic%20${auth},x-langfuse-ingestion-version=4`;
}

/**
 * Registers the global OpenTelemetry tracer provider via Strands.
 * Strands agents pick it up automatically; our own spans (jobs, sources)
 * use the same provider through `@opentelemetry/api`.
 */
export function initTelemetry() {
  if (provider) return;

  process.env.OTEL_SERVICE_NAME ??= "event-me-ai";
  configureLangfuseExporter();

  provider = setupTracer({
    exporters: {
      otlp: Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT),
      console: process.env.OTEL_CONSOLE_EXPORTER === "true",
    },
    // Copy trace-level attributes (user, session, metadata) from baggage onto
    // every span, including the agent, model and tool spans Strands creates.
    // Langfuse needs them on each span to filter and aggregate.
    baggageProcessor: (key) => TRACE_ATTRIBUTE_KEYS.has(key),
  });
}

/** Exports buffered spans. Call before a serverless invocation returns. */
export async function flushTelemetry() {
  await provider?.forceFlush();
}
