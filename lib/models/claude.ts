import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
}: ClaudeCallParams): Promise<string> {
  const response = await getClient().messages.create({
    model: "claude-3-5-sonnet-latest",
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
