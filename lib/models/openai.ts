import OpenAI from "openai";
import { requireApiKey } from "@/lib/env";
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
  temperature: number;
  maxTokens: number;
}

export async function callOpenAI({
  prompt,
  systemPrompt,
  temperature,
  maxTokens,
}: OpenAICallParams): Promise<ModelCallResult> {
  const response = await getClient().chat.completions.create({
    model: OPENAI_MODEL_ID,
    temperature,
    max_tokens: maxTokens,
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
  };
}
