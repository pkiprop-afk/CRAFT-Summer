/**
 * Post-run remedy for the deterministic judge_truncated cells (J2-REVISED
 * systematic pattern: GPT-produced x Claude-as-secondary).
 *
 * Per affected cell:
 *   1. DIAGNOSTIC — one call at the standard 4000 budget with thinking capture,
 *      to see what the judge does with that budget on this input. Expected to
 *      truncate; the captured thinking is the point. NOT recorded as a study
 *      attempt: it is instrumentation of the instrument.
 *   2. FILL — one call at an extended budget (12000) with capture, to complete
 *      the evaluation. Scores are parsed by the same parser, the record built
 *      by the same builder, and saved through the same /api/evaluations route
 *      (referential integrity + one-judge-once). Recorded as a study attempt
 *      with a message naming the extended budget.
 *
 * SCOPE: exactly the (cell, judge) pairs with a judge_truncated attempt and no
 * saved evaluation. Blinding discipline is preserved — the judge payload is
 * task content + response only; the family check is asserted before any call.
 *
 * Run with the dev server up: node scripts/remedyJudgeTruncation.ts [--base URL]
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { buildEvaluatorPrompt, parseEvaluatorResponse } from "../lib/evaluator.ts";
import { buildEvaluationRecord } from "../lib/evaluationRecord.ts";
import { isFamilyCollision } from "../lib/models/registry.ts";
import { recordEvalAttempt } from "../lib/evalTelemetry.ts";
import type { EvaluationRecord, ResultRecord, TaskRecord } from "../types/index.ts";

const REPO = process.cwd();
const argv = process.argv.slice(2);
const baseArg = argv.indexOf("--base");
const BASE = baseArg !== -1 ? argv[baseArg + 1] : "http://localhost:3100";
const STANDARD_BUDGET = 4000;
const EXTENDED_BUDGET = 12000;
const EVALUATOR_SYSTEM_PROMPT = "You are a rigorous, unbiased benchmark evaluator.";
const THINKING_DUMP = path.join(REPO, "data", "remedy_thinking_dump.json");

function readJson<T>(name: string, fallback: T): T {
  const p = path.join(REPO, "data", name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// lib/env reads process.env; a Node script must load .env.local itself.
function loadEnv(): void {
  const p = path.join(REPO, ".env.local");
  if (!existsSync(p)) return;
  for (const raw of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnv();
  // Imported after env load so the client picks up the key.
  const { callClaude } = await import("../lib/models/claude.ts");
  const { provenanceFingerprintFor } = await import("../lib/models/provenance.ts");

  const results = readJson<ResultRecord[]>("results.json", []);
  const evaluations = readJson<EvaluationRecord[]>("evaluations.json", []);
  const tasks = readJson<TaskRecord[]>("tasks.json", []);
  const attempts = readJson<Array<{ outcome?: string; anonymized_output_id?: string; evaluator_model?: string }>>(
    "eval_attempts.json",
    []
  );
  const taskById = new Map(tasks.map((t) => [t.task_id, t]));

  // Affected = judge_truncated attempt exists AND no saved evaluation by that judge.
  const judged = new Set(evaluations.map((e) => `${e.result_id}::${e.evaluator_model}`));
  const byToken = new Map(results.map((r) => [r.anonymized_output_id, r]));
  const affected: Array<{ result: ResultRecord; evaluator: string }> = [];
  const seen = new Set<string>();
  for (const a of attempts) {
    if (a.outcome !== "judge_truncated") continue;
    const r = byToken.get(a.anonymized_output_id ?? "");
    if (!r || !a.evaluator_model) continue;
    const key = `${r.result_id}::${a.evaluator_model}`;
    if (judged.has(key) || seen.has(key)) continue;
    seen.add(key);
    affected.push({ result: r, evaluator: a.evaluator_model });
  }

  console.log("=".repeat(78));
  console.log("JUDGE-TRUNCATION REMEDY — diagnostic + extended-budget fill");
  console.log("=".repeat(78));
  console.log(`affected (truncated, still unevaluated): ${affected.length}\n`);

  const dump: Array<Record<string, unknown>> = [];
  let filled = 0;
  let failed = 0;

  for (const { result, evaluator } of affected) {
    const task = taskById.get(result.task_id);
    if (!task) continue;
    if (evaluator !== "claude-sonnet-5") {
      console.log(`  SKIP ${result.task_id}: remedy implements the Claude judge only`);
      continue;
    }
    // Blinding-discipline assertions, same rules as the API path.
    if (isFamilyCollision(result.model_name, evaluator)) {
      console.log(`  REFUSED ${result.task_id}: family collision`);
      continue;
    }
    const prompt = buildEvaluatorPrompt({
      task_description: task.task_description,
      expected_constraints: task.expected_constraints,
      rubric_notes: task.rubric_notes,
      model_response: result.raw_model_output,
    });

    console.log(
      `\n--- ${result.task_id} / ${result.prompt_condition} / produced by ${result.model_name} ` +
        `(${result.raw_model_output.length} chars) -> ${evaluator}`
    );

    // 1. Diagnostic at the standard budget.
    const diag = await callClaude({
      prompt,
      systemPrompt: EVALUATOR_SYSTEM_PROMPT,
      maxTokens: STANDARD_BUDGET,
      captureThinking: true,
    });
    console.log(
      `  diagnostic @${STANDARD_BUDGET}: stop_reason=${diag.stop_reason}, ` +
        `text=${diag.text.length} chars, thinking=${(diag.thinking ?? "").length} chars`
    );

    // 2. Fill at the extended budget.
    const fill = await callClaude({
      prompt,
      systemPrompt: EVALUATOR_SYSTEM_PROMPT,
      maxTokens: EXTENDED_BUDGET,
      captureThinking: true,
    });
    console.log(
      `  fill @${EXTENDED_BUDGET}:      stop_reason=${fill.stop_reason}, ` +
        `text=${fill.text.length} chars, thinking=${(fill.thinking ?? "").length} chars`
    );

    dump.push({
      task_id: result.task_id,
      prompt_condition: result.prompt_condition,
      producing_model: result.model_name,
      response_chars: result.raw_model_output.length,
      diagnostic_budget: STANDARD_BUDGET,
      diagnostic_stop_reason: diag.stop_reason,
      diagnostic_thinking: diag.thinking ?? "",
      fill_budget: EXTENDED_BUDGET,
      fill_stop_reason: fill.stop_reason,
      fill_thinking: fill.thinking ?? "",
      fill_text: fill.text,
    });

    const parsed = parseEvaluatorResponse(fill.text);
    if (!parsed) {
      failed++;
      console.log(`  FILL FAILED — no parseable scores at ${EXTENDED_BUDGET}`);
      continue;
    }

    const provenance = await provenanceFingerprintFor("claude-sonnet-5");
    const record = buildEvaluationRecord({
      result_id: result.result_id,
      evaluator_model: evaluator,
      is_primary: false,
      response: {
        constraint_adherence: parsed.constraint_adherence,
        logical_accuracy: parsed.logical_accuracy,
        completeness: parsed.completeness,
        total: parsed.total,
        justification: parsed.justification,
        evaluator_provenance_fingerprint: provenance,
        evaluator_retry_count: 0,
        evaluator_retry_log: [],
      },
    });

    const save = await fetch(`${BASE}/api/evaluations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!save.ok) {
      failed++;
      const data = await save.json();
      console.log(`  SAVE FAILED — ${data.error ?? save.status}`);
      continue;
    }

    // The FILL is a real study evaluation and is recorded as an attempt; the
    // diagnostic deliberately is not — it would inflate the truncation count
    // with re-observations of already-known cells.
    await recordEvalAttempt({
      recorded_at: new Date().toISOString(),
      evaluator_model: evaluator,
      is_primary: false,
      anonymized_output_id: result.anonymized_output_id,
      outcome: parsed.justification_missing ? "parsed_without_justification" : "succeeded_first_try",
      retry_count: 0,
      http_status: 200,
      message: `post-run remedy: evaluated at extended budget ${EXTENDED_BUDGET}`,
    });

    filled++;
    console.log(
      `  FILLED — ${parsed.constraint_adherence}/4, ${parsed.logical_accuracy}/4, ` +
        `${parsed.completeness}/2, total ${parsed.total}/10`
    );
  }

  writeFileSync(THINKING_DUMP, JSON.stringify(dump, null, 2) + "\n", "utf-8");
  console.log("\n" + "=".repeat(78));
  console.log(`FILLED ${filled} · FAILED ${failed} · thinking dump: ${THINKING_DUMP}`);
  console.log("=".repeat(78));
}

main();
