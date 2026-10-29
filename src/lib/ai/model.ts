import type { Message, StreamOptions } from "@strands-agents/sdk";
import { AnthropicModel, type AnthropicModelOptions } from "@strands-agents/sdk/models/anthropic";

export const DEFAULT_MODEL_ID = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

/**
 * Claude Opus 5.5 rejects forced tool_choice (`any` / `tool`). Strands forces the
 * structured-output tool when the model answers in plain text, so we downgrade
 * forced choices to `auto`; the agent prompts already require the output tool,
 * and Strands raises StructuredOutputError if it is still skipped.
 */
class ClaudeModel extends AnthropicModel {
  stream(messages: Message[], options?: StreamOptions) {
    if (options?.toolChoice && !("auto" in options.toolChoice)) {
      options = { ...options, toolChoice: { auto: {} } };
    }
    return super.stream(messages, options);
  }
}

type ModelOptions = {
  /** Enable Claude's server-side web search tool. */
  webSearch?: { maxUses: number };
  effort?: "low" | "medium" | "high";
  /** Override the Anthropic client config (tests inject a fake fetch). */
  clientConfig?: AnthropicModelOptions["clientConfig"];
};

export function createModel({ webSearch, effort = "medium", clientConfig }: ModelOptions = {}) {
  const config: AnthropicModelOptions = {
    modelId: DEFAULT_MODEL_ID,
    maxTokens: 16000,
    params: {
      output_config: { effort },
      // Re-run declined requests on a fallback model instead of failing the job.
      fallbacks: "default",
    },
    betas: ["server-side-fallback-2026-07-01"],
    cacheConfig: {},
    clientConfig,
  };
  if (webSearch) {
    config.anthropicTools = [
      { type: "web_search_20260209", name: "web_search", max_uses: webSearch.maxUses },
    ];
  }
  return new ClaudeModel(config);
}
