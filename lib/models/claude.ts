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
  temperature: number;
  maxTokens: number;
}

export async function callClaude({
  prompt,
  systemPrompt,
  temperature,
  maxTokens,
}: ClaudeCallParams): Promise<ModelCallResult> {
  const response = await getClient().messages.create({
    model: ANTHROPIC_MODEL_ID,
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  return {
    text,
    stop_reason: response.stop_reason ?? null,
    truncated: response.stop_reason === "max_tokens",
  };
}
