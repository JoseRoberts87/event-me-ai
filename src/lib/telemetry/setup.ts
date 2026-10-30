import { setupTracer } from "@strands-agents/sdk/telemetry";
import { TRACE_ATTRIBUTE_KEYS } from "./attributes";

let provider: { forceFlush(): Promise<void> } | null = null;

/**
 * Points Strands' OTLP exporter at Langfuse. Returns false when Langfuse keys
 * are missing, in which case tracing stays off.
 * See https://langfuse.com/integrations/native/opentelemetry
 */
export function configureLangfuseExporter(): boolean {
  const { LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY } = process.env;
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) return false;

  const baseUrl = (process.env.LANGFUSE_BASE_URL ?? "https://cloud.langfuse.com").replace(/\/$/, "");
  const auth = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64");
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `${baseUrl}/api/public/otel`;
  // Ingestion v4 makes traces show up in real time instead of after a delay.
  process.env.OTEL_EXPORTER_OTLP_HEADERS = `Authorization=Basic%20${auth},x-langfuse-ingestion-version=4`;
  return true;
}

/**
 * Registers the global OpenTelemetry tracer provider via Strands, exporting
 * to Langfuse. Strands agents pick it up automatically; our own spans (jobs,
 * sources) use the same provider through `@opentelemetry/api`.
 */
export function initTelemetry() {
  if (provider) return;
  if (!configureLangfuseExporter()) {
    console.warn("LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set; tracing disabled");
    return;
  }

  process.env.OTEL_SERVICE_NAME ??= "event-me-ai";
  provider = setupTracer({
    exporters: { otlp: true },
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
