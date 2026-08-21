/**
 * Checkpoint report for a partially-complete main study.
 *
 * Read-only: makes no model calls and writes nothing. Safe to run at any point
 * during or after a batch.
 *
 * All score aggregates use the PRIMARY judge only, never an average of the two
 * — see lib/resultsJoin.ts for why. The secondary judge appears here only in
 * the data-quality section.
 *
 * Run: npm run checkpoint
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { joinResults, type ScoredResult } from "../lib/resultsJoin.ts";
import { TEST_MODELS } from "../lib/models/registry.ts";
import type { EvaluationRecord, PromptCondition, ResultRecord } from "../types/index.ts";

const REPO = process.cwd();
const TASK_COUNT = 50;
const CONDITIONS: PromptCondition[] = ["baseline", "craft"];
const EXPECTED_GENERATIONS = TASK_COUNT * CONDITIONS.length * TEST_MODELS.length;
const EXPECTED_EVALUATIONS = EXPECTED_GENERATIONS * 2;

function readJson<T>(name: string, fallback: T): T {
  const p = path.join(REPO, "data", name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function fmt(n: number | null, digits = 2): string {
  return n === null ? "—" : n.toFixed(digits);
}

function pct(n: number, d: number): string {
  return d === 0 ? "—" : `${((n / d) * 100).toFixed(0)}%`;
}

function rule(char = "=") {
  console.log(char.repeat(78));
}

/** A pair is one task x one model, under both conditions. */
interface Pair {
  task_id: string;
  model: string;
  baseline: ScoredResult | null;
  craft: ScoredResult | null;
}

function buildPairs(scored: ScoredResult[]): Pair[] {
  const byKey = new Map<string, Pair>();
  for (const s of scored) {
    if (s.result.run_type !== "main") continue;
    const key = `${s.result.task_id}::${s.result.model_name}`;
    const pair =
      byKey.get(key) ??
      ({
        task_id: s.result.task_id,
        model: s.result.model_name,
        baseline: null,
        craft: null,
      } satisfies Pair);
    if (s.result.prompt_condition === "baseline") pair.baseline = s;
    else pair.craft = s;
    byKey.set(key, pair);
  }
  return [...byKey.values()];
}

/** Both conditions present AND both scored by both judges. */
function isPairComplete(p: Pair): boolean {
  return Boolean(p.baseline?.isComplete && p.craft?.isComplete);
}

function main(): void {
  const results = readJson<ResultRecord[]>("results.json", []);
  const evaluations = readJson<EvaluationRecord[]>("evaluations.json", []);

  const scored = joinResults(results, evaluations);
  const mainScored = scored.filter((s) => s.result.run_type === "main");
  const mainResults = mainScored.map((s) => s.result);
  const mainEvalCount = mainScored.reduce((n, s) => n + s.evaluations.length, 0);

  rule();
  console.log("CHECKPOINT — MAIN STUDY");
  rule();

  if (mainResults.length === 0) {
    console.log("\nNo main-study results recorded yet. Nothing to report.\n");
    return;
  }

  const pairs = buildPairs(scored);
  const complete = pairs.filter(isPairComplete);

  // ------------------------------------------------------------------ PROGRESS
  console.log("\nPROGRESS");
  console.log(
    `  generations   ${mainResults.length}/${EXPECTED_GENERATIONS}` +
      `   (${pct(mainResults.length, EXPECTED_GENERATIONS)})`
  );
  console.log(
    `  evaluations   ${mainEvalCount}/${EXPECTED_EVALUATIONS}` +
      `   (${pct(mainEvalCount, EXPECTED_EVALUATIONS)})`
  );
  console.log("\n  pairs complete (both conditions, each scored by both judges):");
  for (const m of TEST_MODELS) {
    const n = complete.filter((p) => p.model === m).length;
    console.log(`    ${m.padEnd(22)} ${String(n).padStart(3)}/${TASK_COUNT}`);
  }
  console.log(
    `    ${"TOTAL".padEnd(22)} ${String(complete.length).padStart(3)}/${
      TASK_COUNT * TEST_MODELS.length
    }`
  );

  // ------------------------------------------------------------------- CEILING
  console.log("\nCEILING PICTURE  (primary judge, complete pairs only)");
  if (complete.length === 0) {
    console.log("  no complete pairs yet");
  } else {
    for (const m of [...TEST_MODELS, null]) {
      const scopePairs = m === null ? complete : complete.filter((p) => p.model === m);
      if (scopePairs.length === 0) continue;
      const label = m === null ? "ALL MODELS" : m;

      const tied = scopePairs.filter(
        (p) => p.baseline!.primaryTotal === p.craft!.primaryTotal
      );
      const tiedAtCeiling = tied.filter((p) => p.baseline!.primaryTotal === 10);
      const craftUp = scopePairs.filter(
        (p) => p.craft!.primaryTotal! > p.baseline!.primaryTotal!
      ).length;
      const craftDown = scopePairs.filter(
        (p) => p.craft!.primaryTotal! < p.baseline!.primaryTotal!
      ).length;

      console.log(`\n  ${label}  (n=${scopePairs.length} pairs)`);
      console.log(
        `    tied                 ${String(tied.length).padStart(3)}   ` +
          `(${pct(tied.length, scopePairs.length)})`
      );
      console.log(
        `    ...tied at 10/10     ${String(tiedAtCeiling.length).padStart(3)}   ` +
          `(${pct(tiedAtCeiling.length, scopePairs.length)} of pairs, ` +
          `${pct(tiedAtCeiling.length, tied.length)} of ties)`
      );
      console.log(`    craft  > baseline    ${String(craftUp).padStart(3)}`);
      console.log(`    craft  < baseline    ${String(craftDown).padStart(3)}`);
    }
  }

  // --------------------------------------------------------------------- MEANS
  console.log("\nMEAN PRIMARY TOTAL  (complete pairs only)");
  console.log(`  ${"model".padEnd(22)} ${"baseline"} ${"  craft"} ${"   delta"}`);
  for (const m of TEST_MODELS) {
    const scopePairs = complete.filter((p) => p.model === m);
    const b = mean(scopePairs.map((p) => p.baseline!.primaryTotal!));
    const c = mean(scopePairs.map((p) => p.craft!.primaryTotal!));
    const d = b !== null && c !== null ? c - b : null;
    console.log(
      `  ${m.padEnd(22)} ${fmt(b).padStart(8)} ${fmt(c).padStart(7)} ` +
        `${(d === null ? "—" : (d >= 0 ? "+" : "") + d.toFixed(2)).padStart(8)}`
    );
  }

  // -------------------------------------------------------------- DISTRIBUTION
  console.log("\nDISTRIBUTION OF PRIMARY TOTAL  (all scored main cells)");
  const totals = mainScored
    .map((s) => s.primaryTotal)
    .filter((t): t is number => t !== null);
  if (totals.length === 0) {
    console.log("  none scored yet");
  } else {
    const counts = new Map<number, number>();
    for (const t of totals) counts.set(t, (counts.get(t) ?? 0) + 1);
    const maxCount = Math.max(...counts.values());
    // Every rung 10..0 is printed, including empty ones — where the mass ISN'T
    // is the point of the exercise, and a compacted axis would hide it.
    for (let score = 10; score >= 0; score--) {
      const n = counts.get(score) ?? 0;
      const bar = "#".repeat(Math.round((n / maxCount) * 40));
      console.log(
        `  ${String(score).padStart(2)}  ${bar.padEnd(40)} ${String(n).padStart(3)}  ` +
          `${pct(n, totals.length)}`
      );
    }
    console.log(`  ${"".padStart(2)}  ${"".padEnd(40)} ${String(totals.length).padStart(3)}  total`);
  }

  // ------------------------------------------------------------- DATA QUALITY
  console.log("\nDATA QUALITY");

  const truncated = mainResults.filter((r) => r.truncated);
  console.log(`  truncated runs        ${truncated.length}`);
  for (const r of truncated) {
    console.log(
      `    ${r.result_id}  ${r.task_id} / ${r.model_name} / ${r.prompt_condition} ` +
        `(max_tokens=${r.max_tokens})`
    );
  }

  const retried = mainResults.filter((r) => (r.retry_count ?? 0) > 0);
  console.log(`  runs with retries     ${retried.length}`);
  for (const r of retried) {
    console.log(
      `    ${r.result_id}  ${r.task_id} / ${r.model_name} / ${r.prompt_condition} ` +
        `— ${r.retry_count} retry/retries`
    );
  }

  const mainEvals = mainScored.flatMap((s) => s.evaluations);
  const evalRetried = mainEvals.filter((e) => (e.retry_count ?? 0) > 0);
  const primaryRetried = evalRetried.filter((e) => e.is_primary).length;
  console.log(
    `  evals with retries    ${evalRetried.length}` +
      (evalRetried.length > 0
        ? `   (${primaryRetried} on the PRIMARY judge — reliability signal)`
        : "")
  );

  const incomplete = mainScored.filter((s) => !s.isComplete);
  console.log(`  incomplete cells      ${incomplete.length}`);
  for (const s of incomplete) {
    const have = [
      s.primary ? "primary" : null,
      s.secondary ? "secondary" : null,
    ].filter(Boolean);
    console.log(
      `    ${s.result.result_id}  ${s.result.task_id} / ${s.result.model_name} / ` +
        `${s.result.prompt_condition} — has ${have.length ? have.join(" + ") : "no judge"}`
    );
  }

  const halfPairs = pairs.filter((p) => !p.baseline || !p.craft);
  if (halfPairs.length > 0) {
    console.log(`  half pairs            ${halfPairs.length}  (one condition not yet run)`);
    for (const p of halfPairs) {
      console.log(
        `    ${p.task_id} / ${p.model} — missing ${p.baseline ? "craft" : "baseline"}`
      );
    }
  }

  // -------------------------------------------------------------------- TIMING
  console.log("\nTIMING");
  const times = mainResults
    .map((r) => Date.parse(r.run_date))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (times.length < 2) {
    console.log("  not enough runs to estimate");
  } else {
    const first = times[0];
    const last = times[times.length - 1];
    const elapsedMs = last - first;
    const perGen = elapsedMs / times.length;
    const remaining = EXPECTED_GENERATIONS - mainResults.length;
    console.log(`  first run     ${new Date(first).toISOString()}`);
    console.log(`  last run      ${new Date(last).toISOString()}`);
    console.log(
      `  elapsed       ${(elapsedMs / 60000).toFixed(1)} min for ${mainResults.length} ` +
        `generations  (${(perGen / 1000).toFixed(1)} s/generation)`
    );
    console.log(
      `  projected     ${remaining} generation(s) remaining → ` +
        `~${((remaining * perGen) / 60000).toFixed(0)} min` +
        `   (~${((EXPECTED_GENERATIONS * perGen) / 60000).toFixed(0)} min for the full study)`
    );
    console.log(
      "  NOTE: wall-clock spans any pause between legs, so this is an upper bound on\n" +
        "        active run time and the projection is correspondingly conservative."
    );
  }

  console.log("");
  rule();
  console.log(
    complete.length > 0
      ? `${complete.length} complete pair(s). Scores are PRIMARY-judge only.`
      : "No complete pairs yet."
  );
  rule();
}

main();
