import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callGemini } from "@/lib/models/gemini";
import { callOpenAI } from "@/lib/models/openai";
import { buildEvaluatorPrompt, parseEvaluatorResponse } from "@/lib/evaluator";
import { MissingApiKeyError } from "@/lib/env";
import { checkJudgeAllowed } from "@/lib/blindingGuard";
import {
  MissingManifestError,
  provenanceFingerprintFor,
} from "@/lib/models/provenance";
import {
  ANTHROPIC_MODEL_ID,
  GOOGLE_MODEL_ID,
  OPENAI_MODEL_ID,
  type EvaluatorModelId,
} from "@/lib/models/registry";
import type { ModelCallResult } from "@/lib/models/types";

const EVALUATOR_SYSTEM_PROMPT = "You are a rigorous, unbiased benchmark evaluator.";

interface EvaluateRequestBody {
  /**
   * The blinding token. The producing model and condition are derived from it
   * SERVER-SIDE via lib/blindingGuard; the client no longer asserts them, so a
   * wrong or spoofed value cannot defeat the family check.
   */
  anonymized_output_id: string;
  task_description: string;
  expected_constraints: string[];
  rubric_notes: string;
  model_response: string;
  evaluator: EvaluatorModelId;
}

export async function POST(request: Request) {
  const body: EvaluateRequestBody = await request.json();
  const {
    anonymized_output_id,
    task_description,
    expected_constraints,
    rubric_notes,
    model_response,
    evaluator,
  } = body;

  // 5e — hard block, derived from the blinding map rather than client input.
  const judgeCheck = await checkJudgeAllowed(anonymized_output_id, evaluator);
  if (!judgeCheck.allowed) {
    const message =
      judgeCheck.reason === "unknown_token"
        ? `Evaluation refused: ${anonymized_output_id} is not a known blinding token. ` +
          "Evaluations may only be run against a recorded run."
        : judgeCheck.reason === "unknown_judge"
          ? `Evaluation refused: ${evaluator} is not a recognized judge model.`
          : `Evaluation refused: judge ${evaluator} is family "${judgeCheck.judge_family}", ` +
            `which matches the producing model's family. Self-family scoring is a validity ` +
            `threat and is blocked.`;
    return NextResponse.json(
      { error: message, reason: judgeCheck.reason, judge_family: judgeCheck.judge_family },
      { status: 409 }
    );
  }

  // NOTE: the judge payload is built from task content and the response only.
  // No model name, no prompt condition, no blinding token.
  const prompt = buildEvaluatorPrompt({
    task_description,
    expected_constraints,
    rubric_notes,
    model_response,
  });

  let evaluatorProvenance: string;
  try {
    evaluatorProvenance = await provenanceFingerprintFor(evaluator);
  } catch (err) {
    if (err instanceof MissingManifestError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provenance lookup failed" },
      { status: 503 }
    );
  }

  let call: ModelCallResult;
  try {
    if (evaluator === GOOGLE_MODEL_ID) {
      call = await callGemini(prompt);
    } else if (evaluator === ANTHROPIC_MODEL_ID) {
      call = await callClaude({
        prompt,
        systemPrompt: EVALUATOR_SYSTEM_PROMPT,
        temperature: 0,
        maxTokens: 1024,
      });
    } else if (evaluator === OPENAI_MODEL_ID) {
      call = await callOpenAI({
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

  const parsed = parseEvaluatorResponse(call.text);
  if (!parsed) {
    return NextResponse.json(
      { error: "Failed to parse evaluator response", raw_response: call.text },
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
    evaluator_provenance_fingerprint: evaluatorProvenance,
    evaluator_truncated: call.truncated,
  });
}
