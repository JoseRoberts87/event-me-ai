import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CBaggagePropagator } from "@opentelemetry/core";
import { BaggageSpanProcessor } from "@opentelemetry/baggage-span-processor";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { Agent } from "@strands-agents/sdk";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { createModel } from "@/lib/ai/model";
import { agentTraceAttributes, withSpan } from "@/lib/telemetry";
import { TRACE_ATTRIBUTE_KEYS } from "@/lib/telemetry/attributes";
import { configureLangfuseExporter } from "@/lib/telemetry/setup";

const exporter = new InMemorySpanExporter();
const requests: Record<string, unknown>[] = [];

/** Fake Anthropic API: answers every request by calling the structured output tool. */
const fakeFetch: typeof fetch = async (_url, init) => {
  const body = JSON.parse(String(init?.body));
  requests.push(body);
  const toolName = body.tools?.find((t: { name: string; type?: string }) => !t.type)?.name;
  const events = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
    ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: toolName, input: {} } }],
    ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: JSON.stringify({ city: "Austin" }) } }],
    ["content_block_stop", { type: "content_block_stop", index: 0 }],
    ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 5 } }],
    ["message_stop", { type: "message_stop" }],
  ];
  const sse = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(sse, { headers: { "content-type": "text/event-stream" } });
};

beforeAll(() => {
  process.env.ANTHROPIC_API_KEY ??= "test";
  const provider = new NodeTracerProvider({
    spanProcessors: [new BaggageSpanProcessor((key) => TRACE_ATTRIBUTE_KEYS.has(key)), new SimpleSpanProcessor(exporter)],
  });
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CBaggagePropagator());
});

afterAll(() => {
  trace.disable();
  context.disable();
  propagation.disable();
});

describe("Strands telemetry", () => {
  it("nests agent and model spans under our span, tagged with correlation ids", async () => {
    const ctx = { userId: "user-1", eventId: "event-1", job: "test-job" };
    const output = await withSpan("job.test", ctx, async () => {
      const agent = new Agent({
        name: "test-agent",
        model: createModel({ clientConfig: { baseURL: "http://fake-anthropic.test", fetch: fakeFetch, maxRetries: 0 } }),
        structuredOutputSchema: z.object({ city: z.string() }),
        traceAttributes: agentTraceAttributes(ctx),
        printer: false,
      });
      const result = await agent.invoke("Where is the show?");
      return result.structuredOutput;
    });

    expect(output).toEqual({ city: "Austin" });

    const spans = exporter.getFinishedSpans();
    const root = spans.find((s) => s.name === "job.test")!;
    expect(root).toBeDefined();

    const agentSpans = spans.filter((s) => s !== root);
    expect(agentSpans.length).toBeGreaterThan(0);
    for (const span of agentSpans) {
      expect(span.spanContext().traceId).toBe(root.spanContext().traceId);
      expect(span.attributes["user.id"]).toBe("user-1");
      expect(span.attributes["session.id"]).toBe("event:event-1");
      expect(span.attributes["langfuse.trace.metadata.event_id"]).toBe("event-1");
      expect(span.attributes["langfuse.trace.metadata.job"]).toBe("test-job");
      expect(span.attributes["langfuse.trace.name"]).toBe("job.test");
    }
    expect(agentSpans.some((s) => String(s.attributes["gen_ai.request.model"] ?? "").includes("claude"))).toBe(true);
  });

  it("sends Claude-compatible requests", () => {
    const body = requests[0];
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.output_config).toEqual({ effort: "medium" });
    expect(body.fallbacks).toBe("default");
    // Opus 5.5 rejects forced tool_choice.
    for (const req of requests) {
      const choice = req.tool_choice as { type: string } | undefined;
      if (choice) expect(choice.type).toBe("auto");
    }
  });
});

describe("configureLangfuseExporter", () => {
  it("derives the OTLP endpoint and auth header from Langfuse keys", () => {
    const saved = { ...process.env };
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_HEADERS;
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-1";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-1";
    process.env.LANGFUSE_BASE_URL = "https://us.cloud.langfuse.com/";

    configureLangfuseExporter();

    expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBe("https://us.cloud.langfuse.com/api/public/otel");
    const auth = Buffer.from("pk-lf-1:sk-lf-1").toString("base64");
    expect(process.env.OTEL_EXPORTER_OTLP_HEADERS).toBe(`Authorization=Basic%20${auth},x-langfuse-ingestion-version=4`);
    process.env = saved;
  });
});
