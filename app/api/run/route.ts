import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callOpenAI } from "@/lib/models/openai";
import { getTask } from "@/lib/db";

interface RunRequestBody {
  task_id: string;
  prompt: string;
  model: "claude-3-5-sonnet" | "gpt-4o";
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

export async function POST(request: Request) {
  const body: RunRequestBody = await request.json();
  const { task_id, prompt, model, temperature, max_tokens, system_prompt } = body;

  const task = await getTask(task_id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const missingPrompts: string[] = [];
  if (!task.baseline_prompt) missingPrompts.push("baseline");
  if (!task.craft_prompt) missingPrompts.push("craft");
  if (missingPrompts.length > 0) {
    return NextResponse.json(
      {
        error: `Run blocked: this task is missing its ${missingPrompts.join(" and ")} prompt${
          missingPrompts.length > 1 ? "s" : ""
        }. Both baseline and CRAFT prompts must be authored before either condition can be run.`,
        missing_prompts: missingPrompts,
      },
      { status: 409 }
    );
  }

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
