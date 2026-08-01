import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callOpenAI } from "@/lib/models/openai";

interface RunRequestBody {
  prompt: string;
  model: "claude-3-5-sonnet" | "gpt-4o";
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

export async function POST(request: Request) {
  const body: RunRequestBody = await request.json();
  const { prompt, model, temperature, max_tokens, system_prompt } = body;

  const start = Date.now();
  let output: string;

  try {
    if (model === "claude-3-5-sonnet") {
      output = await callClaude({
        prompt,
        systemPrompt: system_prompt,
        temperature,
        maxTokens: max_tokens,
      });
    } else if (model === "gpt-4o") {
      output = await callOpenAI({
        prompt,
        systemPrompt: system_prompt,
        temperature,
        maxTokens: max_tokens,
      });
    } else {
      return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Model call failed" },
      { status: 502 }
    );
  }

  const latency_ms = Date.now() - start;
  return NextResponse.json({ output, model, latency_ms });
}
