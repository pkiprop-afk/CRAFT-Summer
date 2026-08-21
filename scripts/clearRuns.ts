/**
 * F2 — Truncate the run stores.
 *
 * For smoke-test cleanup, so recorded runs never have to be hand-edited out of
 * JSON. Refuses to act without --confirm, and always prints what it is about to
 * remove, broken down by run_type.
 *
 * Run: npm run clear-runs -- --confirm
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { EvaluationRecord, ResultRecord } from "../types/index.ts";

const REPO = process.cwd();
const RESULTS_PATH = path.join(REPO, "data", "results.json");
const EVALUATIONS_PATH = path.join(REPO, "data", "evaluations.json");
const BLINDING_PATH = path.join(REPO, "data", "blinding_map.json");

function readJson<T>(filePath: string, fallback: T): T {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function main(): void {
  const confirmed = process.argv.includes("--confirm");

  const results = readJson<ResultRecord[]>(RESULTS_PATH, []);
  const evaluations = readJson<EvaluationRecord[]>(EVALUATIONS_PATH, []);

  const byRunType = new Map<string, number>();
  for (const r of results) {
    byRunType.set(r.run_type, (byRunType.get(r.run_type) ?? 0) + 1);
  }

  const resultIds = new Set(results.map((r) => r.result_id));
  const evalsByRunType = new Map<string, number>();
  for (const e of evaluations) {
    const parent = results.find((r) => r.result_id === e.result_id);
    const key = parent ? parent.run_type : "(orphaned)";
    evalsByRunType.set(key, (evalsByRunType.get(key) ?? 0) + 1);
  }

  console.log(confirmed ? "CLEAR RUNS" : "CLEAR RUNS — DRY RUN");
  console.log("");
  console.log(`results.json      ${results.length} record(s)`);
  for (const [type, count] of [...byRunType.entries()].sort()) {
    console.log(`  run_type=${type.padEnd(12)} ${count}`);
  }
  if (results.length === 0) console.log("  (empty)");

  console.log(`\nevaluations.json  ${evaluations.length} record(s)`);
  for (const [type, count] of [...evalsByRunType.entries()].sort()) {
    console.log(`  run_type=${type.padEnd(12)} ${count}`);
  }
  if (evaluations.length === 0) console.log("  (empty)");

  const orphaned = evaluations.filter((e) => !resultIds.has(e.result_id)).length;
  if (orphaned > 0) console.log(`\n  ${orphaned} evaluation(s) already orphaned`);

  if (!confirmed) {
    console.log("\nRefusing to delete without --confirm.");
    console.log("Re-run as:  npm run clear-runs -- --confirm");
    process.exitCode = 1;
    return;
  }

  if (results.length === 0 && evaluations.length === 0) {
    console.log("\nNothing to delete — both stores are already empty.");
    return;
  }

  writeJsonArray(RESULTS_PATH);
  writeJsonArray(EVALUATIONS_PATH);

  console.log(`\nDELETED ${results.length} result(s) and ${evaluations.length} evaluation(s).`);
  console.log("results.json and evaluations.json are now [].");

  if (existsSync(BLINDING_PATH)) {
    const map = readJson<Record<string, unknown>>(BLINDING_PATH, {});
    const size = Object.keys(map).length;
    console.log(
      `\nNOTE: data/blinding_map.json still holds ${size} token(s) and was NOT cleared.` +
        "\n      Tokens are opaque and never reused, so the next run continues the sequence." +
        "\n      Leaving it intact preserves the audit trail of what was generated."
    );
  }
}

function writeJsonArray(filePath: string): void {
  writeFileSync(filePath, "[]\n", "utf-8");
}

main();
