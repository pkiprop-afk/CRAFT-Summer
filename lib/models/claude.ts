import Anthropic from "@anthropic-ai/sdk";
import { requireApiKey } from "@/lib/env";
import { ANTHROPIC_MODEL_ID } from "@/lib/models/registry";
import type { ModelCallResult } from "@/lib/models/types";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireApiKey("anthropic") });
  }
  return client;
}

export interface ClaudeCallParams {
  prompt: string;
  systemPrompt: string;
  maxTokens: number;
  /**
   * Post-run remedy diagnostics ONLY: also return the thinking-block text the
   * extraction below normally discards. Capture is read-only — it changes no
   * request parameter, so a call with capture on sends exactly the bytes a
   * call with capture off sends. Default off; no study path sets it.
   */
  captureThinking?: boolean;
}

/**
 * G2 — no `temperature` is sent. claude-sonnet-5 rejects the parameter
 * outright ("`temperature` is deprecated for this model"), so including it
 * fails the request. Runs record temperature: null.
 *
 * G3 — `effort` is deliberately left unset, taking the provider default.
 */
export async function callClaude({
  prompt,
  systemPrompt,
  maxTokens,
  captureThinking = false,
}: ClaudeCallParams): Promise<ModelCallResult> {
  const response = await getClient().messages.create({
    model: ANTHROPIC_MODEL_ID,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const result: ModelCallResult = {
    text,
    stop_reason: response.stop_reason ?? null,
    truncated: response.stop_reason === "max_tokens",
    // Anthropic does not report a reasoning-token figure.
    reasoning_tokens: null,
  };

  if (captureThinking) {
    // Diagnostic only — reads blocks the normal extraction discards; the
    // request above is byte-identical with or without capture.
    result.thinking = response.content
      .filter(
        (block): block is Anthropic.ThinkingBlock => block.type === "thinking"
      )
      .map((block) => block.thinking)
      .join("\n\n");
  }

  return result;
}
