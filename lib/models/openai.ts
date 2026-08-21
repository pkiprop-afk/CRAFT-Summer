import OpenAI from "openai";
import { requireApiKey } from "@/lib/env";
import { OPENAI_REASONING_EFFORT } from "@/lib/decoding";
import { OPENAI_MODEL_ID } from "@/lib/models/registry";
import type { ModelCallResult } from "@/lib/models/types";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: requireApiKey("openai") });
  }
  return client;
}

export interface OpenAICallParams {
  prompt: string;
  systemPrompt: string;
  maxTokens: number;
}

/**
 * G2 — no `temperature` is sent. gpt-5.5-2026-04-23 pins it: "does not support
 * 0.2 with this model. Only the default (1) value is supported." Runs record
 * temperature: 1.0 as what the provider used.
 *
 * G3 — `reasoning_effort` is pinned to "low" on every call, test model and
 * judge alike, so the effort level is stated by the study rather than left to a
 * provider default that the response does not report.
 *
 * Uses `max_completion_tokens`; this model family does not accept `max_tokens`.
 */
export async function callOpenAI({
  prompt,
  systemPrompt,
  maxTokens,
}: OpenAICallParams): Promise<ModelCallResult> {
  const response = await getClient().chat.completions.create({
    model: OPENAI_MODEL_ID,
    max_completion_tokens: maxTokens,
    reasoning_effort: OPENAI_REASONING_EFFORT,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  });

  const choice = response.choices[0];
  const finishReason = choice?.finish_reason ?? null;

  return {
    text: choice?.message?.content ?? "",
    stop_reason: finishReason,
    truncated: finishReason === "length",
    reasoning_tokens:
      response.usage?.completion_tokens_details?.reasoning_tokens ?? null,
  };
}
