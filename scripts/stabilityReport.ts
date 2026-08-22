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

  for (const model of [...new Set(rows.map((c) => c.model))].sort()) {
    const ms = complete.filter((c) => c.model === model).map((c) => popSd(c.scores));
    console.log(
      `  ${model.padEnd(22)} mean within-cell SD ${mean(ms).toFixed(3)}  ` +
        `(n=${ms.length} cells)`
    );
  }

  const zeroSpread = complete.filter((c) => Math.max(...c.scores) === Math.min(...c.scores));
  const maxSpread = complete.length
    ? Math.max(...complete.map((c) => Math.max(...c.scores) - Math.min(...c.scores)))
    : 0;
  console.log(`\ncells with zero spread: ${zeroSpread.length}/${complete.length}`);
  console.log(`largest spread in any cell: ${maxSpread}`);
  console.log(
    `\nCONTEXT: the main-study paired delta is -0.30. A mean within-cell SD ` +
      `above that value means a single run's score moves more from sampling ` +
      `noise than the average CRAFT effect — judge the delta against this.`
  );
  console.log("=".repeat(88));
}

main();
