import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callGemini } from "@/lib/models/gemini";
import { callOpenAI } from "@/lib/models/openai";
import { buildEvaluatorPrompt, parseEvaluatorResponse } from "@/lib/evaluator";
import { MissingApiKeyError } from "@/lib/env";
import {
  ANTHROPIC_MODEL_ID,
  GOOGLE_MODEL_ID,
  OPENAI_MODEL_ID,
  type EvaluatorModelId,
} from "@/lib/models/registry";

const EVALUATOR_SYSTEM_PROMPT = "You are a rigorous, unbiased benchmark evaluator.";

interface EvaluateRequestBody {
  task_description: string;
  expected_constraints: string[];
  rubric_notes: string;
  model_response: string;
  evaluator: EvaluatorModelId;
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
    if (evaluator === GOOGLE_MODEL_ID) {
      rawResponse = await callGemini(prompt);
    } else if (evaluator === ANTHROPIC_MODEL_ID) {
      rawResponse = await callClaude({
        prompt,
        systemPrompt: EVALUATOR_SYSTEM_PROMPT,
        temperature: 0,
        maxTokens: 1024,
      });
    } else if (evaluator === OPENAI_MODEL_ID) {
      rawResponse = await callOpenAI({
        prompt,
        systemPrompt: EVALUATOR_SYSTEM_PROMPT,
        temperature: 0,
        maxTokens: 1024,
      });
    } else {
      return NextResponse.json({ error: "Unsupported evaluator" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, missing_env_var: err.envVar },
        { status: 503 }
      );
    }
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
