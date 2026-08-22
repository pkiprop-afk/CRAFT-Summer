import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callGemini } from "@/lib/models/gemini";
import { callOpenAI } from "@/lib/models/openai";
import { buildEvaluatorPrompt, parseEvaluatorResponse } from "@/lib/evaluator";
import { MissingApiKeyError } from "@/lib/env";
import { checkJudgeAllowed } from "@/lib/blindingGuard";
import { recordEvalAttempt } from "@/lib/evalTelemetry";
import {
  callWithRetry,
  JUDGE_RETRY_POLICY,
  NonRetryableError,
  RetriesExhaustedError,
  type RetryAttempt,
} from "@/lib/retry";
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

  if (
    evaluator !== GOOGLE_MODEL_ID &&
    evaluator !== ANTHROPIC_MODEL_ID &&
    evaluator !== OPENAI_MODEL_ID
  ) {
    return NextResponse.json({ error: "Unsupported evaluator" }, { status: 400 });
  }

  // M1 — every terminal path below records exactly one attempt, so the
  // denominator includes failures that never become an EvaluationRecord.
  const attemptBase = {
    evaluator_model: evaluator,
    is_primary: evaluator === GOOGLE_MODEL_ID,
    anonymized_output_id,
  };

  let call: ModelCallResult;
  let retries: RetryAttempt[] = [];
  try {
    // I3/I4 — judges get the same retry policy as generations. The primary
    // judge carries every evaluation in the study, so a transient 503 there
    // would otherwise strand runs as singly-judged.
    const outcome = await callWithRetry(
      () =>
        evaluator === GOOGLE_MODEL_ID
          ? callGemini(prompt)
          : evaluator === ANTHROPIC_MODEL_ID
            ? callClaude({ prompt, systemPrompt: EVALUATOR_SYSTEM_PROMPT, maxTokens: 1024 })
            : callOpenAI({ prompt, systemPrompt: EVALUATOR_SYSTEM_PROMPT, maxTokens: 1024 }),
      // Judges are the failing leg, not generation — see JUDGE_RETRY_POLICY.
      JUDGE_RETRY_POLICY
    );
    call = outcome.value;
    retries = outcome.attempts;
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, missing_env_var: err.envVar },
        { status: 503 }
      );
    }
    if (err instanceof RetriesExhaustedError) {
      await recordEvalAttempt({
        ...attemptBase,
        recorded_at: new Date().toISOString(),
        outcome: "exhausted",
        retry_count: Math.max(0, err.attempts.length - 1),
        http_status: null,
        message: err.message.slice(0, 300),
      });
      return NextResponse.json(
        {
          error: `Evaluation failed after ${err.attempts.length} attempts: ${err.message}`,
          retry_log: err.attempts,
        },
        { status: 502 }
      );
    }
    if (err instanceof NonRetryableError) {
      await recordEvalAttempt({
        ...attemptBase,
        recorded_at: new Date().toISOString(),
        outcome: "failed_non_retryable",
        retry_count: 0,
        http_status: err.httpStatus ?? null,
        message: err.message.slice(0, 300),
      });
      return NextResponse.json(
        { error: err.message, http_status: err.httpStatus },
        { status: 502 }
      );
    }
    await recordEvalAttempt({
      ...attemptBase,
      recorded_at: new Date().toISOString(),
      outcome: "failed_non_retryable",
      retry_count: 0,
      http_status: null,
      message: (err instanceof Error ? err.message : "Evaluator call failed").slice(0, 300),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Evaluator call failed" },
      { status: 502 }
    );
  }

  const parsed = parseEvaluatorResponse(call.text);
  if (!parsed) {
    // M1 — counted server-side. Detecting this by scraping the page for an
    // error string could miss cases exactly when the job list is longest.
    await recordEvalAttempt({
      ...attemptBase,
      recorded_at: new Date().toISOString(),
      outcome: "unparseable",
      retry_count: retries.length,
      http_status: 200,
      message: call.text.slice(0, 300),
    });
    return NextResponse.json(
      { error: "Failed to parse evaluator response", raw_response: call.text },
      { status: 422 }
    );
  }

  await recordEvalAttempt({
    ...attemptBase,
    recorded_at: new Date().toISOString(),
    // A missing justification is reported as its own outcome so the omission
    // rate is countable, but it is still a success: the scores are intact.
    outcome: parsed.justification_missing
      ? "parsed_without_justification"
      : retries.length === 0
        ? "succeeded_first_try"
        : "succeeded_after_retry",
    retry_count: retries.length,
    http_status: 200,
    message: parsed.justification_missing ? "judge omitted the Justification line" : null,
  });

  return NextResponse.json({
    constraint_adherence: parsed.constraint_adherence,
    logical_accuracy: parsed.logical_accuracy,
    completeness: parsed.completeness,
    total: parsed.total,
    justification: parsed.justification,
    justification_missing: parsed.justification_missing,
    evaluator,
    evaluator_provenance_fingerprint: evaluatorProvenance,
    evaluator_truncated: call.truncated,
    evaluator_stop_reason: call.stop_reason,
    evaluator_retry_count: retries.length,
    evaluator_retry_log: retries,
    // The judge's verbatim reply. Only the parsed fields are persisted, so this
    // is returned for inspection/audit at run time.
    raw_evaluator_response: call.text,
  });
}
