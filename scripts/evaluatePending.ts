/**
 * Evaluate-only recovery pass.
 *
 * Fills in judges for results whose generation succeeded but whose scoring did
 * not — the cells stranded when a judge provider degraded.
 *
 * HARD CONSTRAINTS:
 *   - NEVER generates. It reads existing raw_model_output and nothing else.
 *     /api/run is not called and cannot be reached from here.
 *   - Drives the same /api/evaluate route the batch runner uses, so blinding,
 *     the vendor-family block, the judge retry policy and attempt telemetry are
 *     the same code. This is a recovery path, not a second pipeline.
 *   - Refuses to add a judge that already scored that result, or a second
 *     primary (see lib/pendingEvaluations.ts).
 *
 * It changes no task, prompt, rubric, judge or score.
 *
 * Run: npm run evaluate-pending -- [--dry-run] [--base http://localhost:3100]
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  findPendingEvaluations,
  stillIncomplete,
  type PendingJudge,
} from "../lib/pendingEvaluations.ts";
import type { EvaluationRecord, ResultRecord, TaskRecord } from "../types/index.ts";

const REPO = process.cwd();
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes("--dry-run");
const baseArg = argv.indexOf("--base");
const BASE = baseArg !== -1 ? argv[baseArg + 1] : "http://localhost:3100";

function readJson<T>(name: string, fallback: T): T {
  const p = path.join(REPO, "data", name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

async function main(): Promise<void> {
  const results = readJson<ResultRecord[]>("results.json", []);
  const evaluations = readJson<EvaluationRecord[]>("evaluations.json", []);
  const tasks = readJson<TaskRecord[]>("tasks.json", []);
  const taskById = new Map(tasks.map((t) => [t.task_id, t]));

  console.log("=".repeat(78));
  console.log("EVALUATE-PENDING — recovery pass");
  console.log("=".repeat(78));
  console.log("Never generates. Reads existing raw_model_output only.\n");

  let pending: PendingJudge[];
  try {
    pending = findPendingEvaluations(results, evaluations);
  } catch (err) {
    console.error(`REFUSED: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
    return;
  }

  const incompleteBefore = stillIncomplete(results, evaluations);
  console.log(`results                 ${results.length}`);
  console.log(`evaluations             ${evaluations.length}`);
  console.log(`incomplete cells        ${incompleteBefore.length}`);
  console.log(`judges to schedule      ${pending.length}\n`);

  if (pending.length === 0) {
    console.log("Nothing pending. Every result has one primary and one secondary.");
    return;
  }

  for (const p of pending) {
    console.log(
      `  ${p.task_id.padEnd(5)} ${p.prompt_condition.padEnd(9)} ${p.model_name.padEnd(21)} -> ` +
        `${p.evaluator.padEnd(20)} ${p.is_primary ? "PRIMARY" : "secondary"}`
    );
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: no calls made.");
    return;
  }

  console.log("\nrunning…\n");

  const filled: PendingJudge[] = [];
  const failed: Array<{ p: PendingJudge; error: string }> = [];

  // Sequential on purpose: this runs when providers are already degraded, so
  // adding concurrency would be the opposite of what the situation calls for.
  for (const p of pending) {
    const task = taskById.get(p.task_id);
    const result = results.find((r) => r.result_id === p.result_id);
    if (!task || !result) {
      failed.push({ p, error: "task or result not found" });
      continue;
    }

    try {
      const res = await fetch(`${BASE}/api/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The blinding token, exactly as the batch runner sends it. The judge
          // payload is built server-side from task content and the response.
          anonymized_output_id: p.anonymized_output_id,
          task_description: task.task_description,
          expected_constraints: task.expected_constraints,
          rubric_notes: task.rubric_notes,
          model_response: result.raw_model_output,
          evaluator: p.evaluator,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        failed.push({ p, error: data.error ?? `HTTP ${res.status}` });
        console.log(`  FAIL  ${p.task_id} ${p.evaluator} — ${data.error ?? res.status}`);
        continue;
      }

      const record: EvaluationRecord = {
        evaluation_id: `EVAL-${randomUUID()}`,
        result_id: p.result_id,
        evaluator_model: p.evaluator,
        evaluator_provenance_fingerprint: data.evaluator_provenance_fingerprint,
        is_primary: p.is_primary,
        evaluated_at: new Date().toISOString(),
        constraint_adherence_score_0_4: data.constraint_adherence,
        logical_accuracy_score_0_4: data.logical_accuracy,
        completeness_score_0_2: data.completeness,
        total_score_0_10: data.total,
        retry_count: data.evaluator_retry_count ?? 0,
        retry_log: data.evaluator_retry_log ?? [],
        evaluator_justification: data.justification,
      };

      const save = await fetch(`${BASE}/api/evaluations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      });
      if (!save.ok) {
        const sd = await save.json();
        failed.push({ p, error: sd.error ?? "save failed" });
        console.log(`  FAIL  ${p.task_id} ${p.evaluator} — save: ${sd.error ?? save.status}`);
        continue;
      }

      filled.push(p);
      console.log(
        `  OK    ${p.task_id} ${p.prompt_condition.padEnd(9)} ${p.evaluator.padEnd(20)} ` +
          `${p.is_primary ? "PRIMARY  " : "secondary"} ${data.total}/10` +
          (record.retry_count > 0 ? `  (${record.retry_count} retries)` : "")
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failed.push({ p, error: message });
      console.log(`  FAIL  ${p.task_id} ${p.evaluator} — ${message}`);
    }
  }

  // Re-read so the summary reflects what is actually on disk.
  const after = readJson<EvaluationRecord[]>("evaluations.json", []);
  const incompleteAfter = stillIncomplete(results, after);

  console.log("\n" + "=".repeat(78));
  console.log(`FILLED   ${filled.length}`);
  console.log(`FAILED   ${failed.length}`);
  for (const f of failed) {
    console.log(`  ${f.p.task_id} ${f.p.evaluator}: ${f.error.slice(0, 160)}`);
  }
  console.log(
    `\nincomplete cells: ${incompleteBefore.length} before -> ${incompleteAfter.length} after`
  );
  if (incompleteAfter.length > 0) {
    console.log("still incomplete:");
    for (const r of incompleteAfter) {
      console.log(`  ${r.result_id}  ${r.task_id} / ${r.model_name} / ${r.prompt_condition}`);
    }
    console.log("\nRe-run this pass once providers recover.");
  }
  console.log("=".repeat(78));
}

main();
