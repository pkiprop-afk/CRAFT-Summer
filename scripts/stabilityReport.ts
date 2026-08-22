/**
 * Stability-subset report: run-to-run consistency of the primary judge's
 * total_score_0_10 within each task x condition x model cell (n=3 repeats).
 *
 * This is where "run-to-run" SD actually lives — the main study is n=1 and has
 * none. Population SD (divide by n) is used within cells: the three runs are
 * the whole cell, not a sample from it.
 *
 * Run: node scripts/stabilityReport.ts
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { EvaluationRecord, ResultRecord } from "../types/index.ts";

const REPO = process.cwd();

function readJson<T>(name: string, fallback: T): T {
  const p = path.join(REPO, "data", name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const popSd = (xs: number[]) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

function main(): void {
  const results = readJson<ResultRecord[]>("results.json", []);
  const evaluations = readJson<EvaluationRecord[]>("evaluations.json", []);
  const primary = new Map(
    evaluations.filter((e) => e.is_primary).map((e) => [e.result_id, e.total_score_0_10])
  );

  const stability = results.filter((r) => r.run_type === "stability");
  const cells = new Map<
    string,
    { task_id: string; model: string; condition: string; scores: number[]; runs: number }
  >();
  for (const r of stability) {
    const key = `${r.task_id}::${r.model_name}::${r.prompt_condition}`;
    const cell =
      cells.get(key) ??
      ({ task_id: r.task_id, model: r.model_name, condition: r.prompt_condition, scores: [], runs: 0 });
    cell.runs++;
    const score = primary.get(r.result_id);
    if (score !== undefined) cell.scores.push(score);
    cells.set(key, cell);
  }

  console.log("=".repeat(88));
  console.log("STABILITY SUBSET — run-to-run consistency (primary judge, n=3 per cell)");
  console.log("=".repeat(88));
  console.log(
    `stability generations: ${stability.length}/120 · cells: ${cells.size}/40 · ` +
      `primary-scored runs: ${[...cells.values()].reduce((s, c) => s + c.scores.length, 0)}`
  );

  const rows = [...cells.values()].sort((a, b) =>
    (a.task_id + a.model + a.condition).localeCompare(b.task_id + b.model + b.condition)
  );
  console.log(
    `\n${"task".padEnd(6)}${"model".padEnd(22)}${"cond".padEnd(10)}${"scores".padEnd(12)}` +
      `${"mean".padEnd(7)}${"SD".padEnd(7)}min  max  spread`
  );
  const complete = rows.filter((c) => c.scores.length === 3);
  for (const c of rows) {
    const sd = c.scores.length >= 2 ? popSd(c.scores) : null;
    const min = Math.min(...c.scores);
    const max = Math.max(...c.scores);
    console.log(
      `${c.task_id.padEnd(6)}${c.model.padEnd(22)}${c.condition.padEnd(10)}` +
        `${c.scores.join(",").padEnd(12)}${mean(c.scores).toFixed(2).padEnd(7)}` +
        `${sd === null ? "n/a".padEnd(7) : sd.toFixed(3).padEnd(7)}` +
        `${c.scores.length ? String(min).padEnd(5) + String(max).padEnd(5) + (max - min) : "-"}` +
        (c.scores.length < 3 ? `   [INCOMPLETE: ${c.scores.length}/3 primary-scored]` : "")
    );
  }

  const overall = complete.map((c) => popSd(c.scores));
  console.log(`\nMEAN WITHIN-CELL SD (complete cells, n=${complete.length}):  ${mean(overall).toFixed(3)}`);

  // C2 — by model: the two run under different decoding regimes (Claude
  // unpinned, GPT pinned at temperature 1.0), so their run-to-run behaviour is
  // not expected to match and must not be pooled silently.
  console.log("  by model (different decoding regimes):");
  for (const model of [...new Set(rows.map((c) => c.model))].sort()) {
    const ms = complete.filter((c) => c.model === model).map((c) => popSd(c.scores));
    console.log(
      `    ${model.padEnd(22)} mean within-cell SD ${mean(ms).toFixed(3)}  (n=${ms.length} cells)`
    );
  }

  // C4 — by condition: if CRAFT output varies more run-to-run than baseline,
  // that is a finding about the framework, not just noise.
  console.log("  by condition:");
  for (const condition of ["baseline", "craft"]) {
    const cs = complete.filter((c) => c.condition === condition).map((c) => popSd(c.scores));
    console.log(
      `    ${condition.padEnd(22)} mean within-cell SD ${mean(cs).toFixed(3)}  (n=${cs.length} cells)`
    );
  }
  console.log("  by model x condition:");
  for (const model of [...new Set(rows.map((c) => c.model))].sort()) {
    for (const condition of ["baseline", "craft"]) {
      const cs = complete
        .filter((c) => c.model === model && c.condition === condition)
        .map((c) => popSd(c.scores));
      console.log(
        `    ${model.padEnd(22)} ${condition.padEnd(10)} ${mean(cs).toFixed(3)}  (n=${cs.length})`
      );
    }
  }

  const zeroSpread = complete.filter((c) => Math.max(...c.scores) === Math.min(...c.scores));
  const maxSpread = complete.length
    ? Math.max(...complete.map((c) => Math.max(...c.scores) - Math.min(...c.scores)))
    : 0;
  console.log(`\ncells with zero spread: ${zeroSpread.length}/${complete.length}`);
  console.log(`largest spread in any cell: ${maxSpread}`);
  // C5 — SDs above are computed from PRIMARY scores only. Any extended-budget
  // judging touched secondaries alone and is reported here, outside the
  // variance computation.
  const attempts = readJson<
    Array<{ message?: string; anonymized_output_id?: string; evaluator_model?: string }>
  >("eval_attempts.json", []);
  const extendedTokens = new Set(
    attempts
      .filter((a) => (a.message ?? "").includes("extended budget"))
      .map((a) => a.anonymized_output_id)
  );
  const affected = stability.filter((r) => extendedTokens.has(r.anonymized_output_id));
  console.log(
    `\nEXTENDED-BUDGET NOTE (C5): ${affected.length} stability run(s) had their SECONDARY ` +
      `judged at an extended budget after a judge truncation.`
  );
  if (affected.length > 0) {
    for (const r of affected) {
      console.log(`  ${r.task_id} / ${r.model_name} / ${r.prompt_condition} / run ${r.run_number}`);
    }
    console.log(
      "  These are secondary-only and are EXCLUDED from every SD above, which uses\n" +
        "  primary scores exclusively."
    );
  }

  // C3 — the comparison that matters.
  const MAIN_DELTA = -0.3;
  const meanSd = mean(overall);
  console.log(
    `\nC3 — EFFECT vs NOISE:\n` +
      `  main-study paired delta (pooled)   ${MAIN_DELTA.toFixed(2)}\n` +
      `  mean within-cell SD (this subset)  ${meanSd.toFixed(3)}\n` +
      `  ratio |delta| / SD                 ${(Math.abs(MAIN_DELTA) / meanSd).toFixed(2)}`
  );
  console.log(
    meanSd >= Math.abs(MAIN_DELTA)
      ? `  VERDICT: the average CRAFT effect is SMALLER than run-to-run noise on a\n` +
          `  single cell. A one-run-per-cell design cannot resolve an effect this size\n` +
          `  at the cell level; the pooled effect survives only because n=100 pairs\n` +
          `  averages that noise down.`
      : `  VERDICT: the average CRAFT effect is LARGER than run-to-run noise on a\n` +
          `  single cell, so the observed delta is not attributable to sampling\n` +
          `  variation alone.`
  );
  console.log("=".repeat(88));
}

main();
