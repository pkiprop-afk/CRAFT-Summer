import OpenAI from "openai";
import { requireApiKey } from "@/lib/env";
import { OPENAI_MODEL_ID } from "@/lib/models/registry";

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
}: OpenAICallParams): Promise<string> {
  const response = await getClient().chat.completions.create({
    model: OPENAI_MODEL_ID,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}
