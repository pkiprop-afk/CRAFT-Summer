import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callGemini } from "@/lib/models/gemini";
import { buildEvaluatorPrompt, parseEvaluatorResponse } from "@/lib/evaluator";

interface EvaluateRequestBody {
  task_description: string;
  expected_constraints: string[];
  rubric_notes: string;
  model_response: string;
  evaluator: "gemini-1.5-pro" | "claude-3-5-sonnet";
}

export async function POST(request: Request) {
  const body: EvaluateRequestBody = await request.json();
  const { task_description, expected_constraints, rubric_notes, model_response, evaluator } = body;

  const prompt = buildEvaluatorPrompt({
    task_description,
    expected_constraints,
    rubric_notes,
    model_response,
  });

  let rawResponse: string;
  try {
    if (evaluator === "gemini-1.5-pro") {
      rawResponse = await callGemini(prompt);
    } else if (evaluator === "claude-3-5-sonnet") {
      rawResponse = await callClaude({
        prompt,
        systemPrompt: "You are a rigorous, unbiased benchmark evaluator.",
        temperature: 0,
        maxTokens: 1024,
      });
    } else {
      return NextResponse.json({ error: "Unsupported evaluator" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Evaluator call failed" },
      { status: 502 }
    );
  }

  const parsed = parseEvaluatorResponse(rawResponse);
  if (!parsed) {
    return NextResponse.json(
      { error: "Failed to parse evaluator response", raw_response: rawResponse },
      { status: 422 }
    );
  }

  return NextResponse.json({
    constraint_adherence: parsed.constraint_adherence,
    logical_accuracy: parsed.logical_accuracy,
    completeness: parsed.completeness,
    total: parsed.total,
    justification: parsed.justification,
    evaluator,
  });
}
