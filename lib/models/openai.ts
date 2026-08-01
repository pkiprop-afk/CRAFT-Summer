import OpenAI from "openai";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
    model: "gpt-4o",
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: prompt },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}
