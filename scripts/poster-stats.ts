/**
 * Read-only poster-stats extract, reusing the app's own results-page logic
 * (lib/results.ts, lib/resultsJoin.ts, lib/stats.ts, lib/irr.ts,
 * lib/invalidation.ts) so the numbers match app/results/page.tsx exactly.
 *
 * Makes no model/API calls. Reads data/*.json only. Writes nothing.
 *
 * Run: node scripts/poster-stats.ts
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { joinResults, type ScoredResult } from "../lib/resultsJoin.ts";
import { pairByCell, pairedUnits, pairedStats, type PairedUnit } from "../lib/results.ts";
import { pairedTTest, wilcoxonSignedRank } from "../lib/stats.ts";
import { computeIrr } from "../lib/irr.ts";
import type { Domain, EvaluationRecord, ResultRecord, TaskRecord } from "../types/index.ts";

// lib/invalidation.ts pulls in a value import via the "@/" alias, which this
// script (run directly under node, without the Next.js path-alias resolver)
// cannot resolve. isResultStale() itself is two lines, so it is inlined here
// rather than imported — see lib/invalidation.ts for the canonical version.
function isResultStale(result: ResultRecord, task: TaskRecord | undefined): boolean {
  if (!task) return true;
  return result.task_version !== task.task_version;
}

const REPO = process.cwd();
void pairByCell; // imported for reference/parity with lib/results.ts's exports

function readJson<T>(name: string, fallback: T): T {
  const p = path.join(REPO, "data", name);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------- t-quantile
// Not implemented anywhere in the app (lib/stats.ts only exposes the tail
// probability, not its inverse). Standard Lanczos + continued-fraction
// incomplete-beta, mirrored from lib/stats.ts's private implementation,
// inverted by bisection for the two-sided 95% critical value.

function logGamma(x: number): number {
  const g = [
    676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  x -= 1;
  let a = 0.99999999999980993;
  const t = x + 7.5;
  for (let i = 0; i < g.length; i++) a += g[i] / (x + i + 1);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function incompleteBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  if (x > (a + 1) / (a + b + 2)) return 1 - incompleteBeta(b, a, 1 - x);
  const lnBeta = logGamma(a) + logGamma(b) - logGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnBeta) / a;
  const EPS = 1e-12;
  let f = 1,
    c = 1,
    d = 0;
  for (let i = 0; i <= 300; i++) {
    const m = Math.floor(i / 2);
    let numerator: number;
    if (i === 0) numerator = 1;
    else if (i % 2 === 0) numerator = (m * (b - m) * x) / ((a + 2 * m - 1) * (a + 2 * m));
    else numerator = -((a + m) * (a + b + m) * x) / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + numerator * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    d = 1 / d;
    c = 1 + numerator / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    f *= c * d;
    if (Math.abs(1 - c * d) < EPS) break;
  }
  return front * (f - 1);
}

function tTailProbability(t: number, df: number): number {
  const x = df / (df + t * t);
  return 0.5 * incompleteBeta(df / 2, 0.5, x);
}

/** Two-sided 95% critical t-value for df degrees of freedom, via bisection. */
function tCritical95(df: number): number {
  if (df < 1) return NaN;
  let lo = 0;
  let hi = 1000;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const p = 2 * tTailProbability(mid, df);
    if (p > 0.05) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ------------------------------------------------------------------ helpers

function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Sample SD (n-1) — the convention used for confidence intervals and d_z.
 * Distinct from lib/results.ts's stddev(), which is the POPULATION SD (n)
 * the app displays on the results page. Both are reported below, labelled. */
function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

function ci95(xs: number[]): [number, number] {
  const n = xs.length;
  if (n < 2) return [NaN, NaN];
  const m = mean(xs);
  const sd = sampleSd(xs);
  const tc = tCritical95(n - 1);
  const halfWidth = tc * (sd / Math.sqrt(n));
  return [m - halfWidth, m + halfWidth];
}

function fmtCi(m: number, ci: [number, number], digits = 2): string {
  return `${m.toFixed(digits)} (${ci[0].toFixed(digits)}, ${ci[1].toFixed(digits)})`;
}

function fmtP(p: number | null): string {
  if (p === null) return "not estimable";
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

interface GroupReport {
  label: string;
  n: number;
  baselineMean: number;
  baselineCi: [number, number];
  craftMean: number;
  craftCi: [number, number];
  deltaMean: number;
  deltaCi: [number, number];
  tP: number | null;
  wilcoxonP: number | null;
  dz: number;
  pctBothTen: number;
}

function reportGroup(label: string, units: PairedUnit[]): GroupReport {
  const baseline = units.map((u) => u.baseline);
  const craft = units.map((u) => u.craft);
  const deltas = units.map((u) => u.craft - u.baseline);

  const t = pairedTTest(deltas);
  const w = wilcoxonSignedRank(deltas);
  const dz = t.sdDifference === 0 ? NaN : t.meanDifference / t.sdDifference;

  const bothTen = units.filter((u) => u.baseline === 10 && u.craft === 10).length;

  return {
    label,
    n: units.length,
    baselineMean: mean(baseline),
    baselineCi: ci95(baseline),
    craftMean: mean(craft),
    craftCi: ci95(craft),
    deltaMean: t.meanDifference,
    deltaCi: ci95(deltas),
    tP: t.pTwoSided,
    wilcoxonP: w.pTwoSided,
    dz,
    pctBothTen: units.length === 0 ? 0 : (bothTen / units.length) * 100,
  };
}

function printGroup(g: GroupReport): void {
  console.log(`\n${g.label}  (n = ${g.n} paired cells)`);
  console.log(`  Baseline   mean ${fmtCi(g.baselineMean, g.baselineCi)}`);
  console.log(`  CRAFT      mean ${fmtCi(g.craftMean, g.craftCi)}`);
  console.log(`  Delta      mean ${fmtCi(g.deltaMean, g.deltaCi)}`);
  console.log(`  Paired t-test          p = ${fmtP(g.tP)}`);
  console.log(`  Wilcoxon signed-rank   p = ${fmtP(g.wilcoxonP)}`);
  console.log(`  Cohen's d_z            ${Number.isNaN(g.dz) ? "not estimable" : g.dz.toFixed(2)}`);
  console.log(`  % pairs both 10/10     ${g.pctBothTen.toFixed(1)}%`);
}

// ----------------------------------------------------------------------- main

function main(): void {
  const results = readJson<ResultRecord[]>("results.json", []);
  const evaluations = readJson<EvaluationRecord[]>("evaluations.json", []);
  const tasks = readJson<TaskRecord[]>("tasks.json", []);
  const taskById = new Map(tasks.map((t) => [t.task_id, t]));

  console.log("=".repeat(88));
  console.log("POSTER STATS — read-only extract, app filters/pairing (lib/results.ts)");
  console.log("=".repeat(88));

  console.log(`\nRECORD TOTALS`);
  console.log(`  total generations (results.json)     ${results.length}`);
  console.log(`  total judge evaluations (evaluations.json)  ${evaluations.length}`);

  const allScored = joinResults(results, evaluations);

  // Mirrors app/results/page.tsx defaults exactly: excludeStale = true,
  // excludeIncomplete = true, primaryTotal !== null. Does NOT filter by
  // run_type — lib/results.ts's pairByCell pools main + stability repeats
  // into the same task x model cell (its own comment: "n=1 in the main
  // study; 1..k in stability"), which is what the live Results page does.
  const filtered: ScoredResult[] = allScored.filter((s) => {
    if (isResultStale(s.result, taskById.get(s.result.task_id))) return false;
    if (!s.isComplete) return false;
    return s.primaryTotal !== null;
  });

  const totalOf = (s: ScoredResult) => s.primaryTotal;
  const units = pairedUnits(filtered, totalOf);
  const pooled = pairedStats(units);

  console.log(`\nFILTERS APPLIED (app defaults): exclude stale = true, exclude incomplete = true`);
  console.log(
    `  stale excluded: ${allScored.filter((s) => isResultStale(s.result, taskById.get(s.result.task_id))).length}`
  );
  console.log(`  incomplete (single-judge) excluded: ${allScored.filter((s) => !s.isComplete).length}`);
  console.log(`  app's own pairedStats() pooled check: n=${pooled.nPairs}, delta=${pooled.delta}`);

  const models = Array.from(new Set(units.map((u) => u.model_name))).sort();

  const groups: GroupReport[] = [];
  for (const model of models) {
    groups.push(reportGroup(model, units.filter((u) => u.model_name === model)));
  }
  groups.push(reportGroup("POOLED (both models)", units));

  console.log("\n" + "-".repeat(88));
  console.log("PER-MODEL AND POOLED PAIRED STATISTICS");
  console.log("-".repeat(88));
  for (const g of groups) printGroup(g);

  // IRR — mirrors page.tsx: computed over complete runs after the excludeStale
  // toggle only (excludeIncomplete does not gate this — IRR needs both judges
  // by definition of "complete").
  const irrScope = allScored.filter(
    (s) => !isResultStale(s.result, taskById.get(s.result.task_id))
  );
  const irr = computeIrr(irrScope);
  console.log("\n" + "-".repeat(88));
  console.log("JUDGE AGREEMENT");
  console.log("-".repeat(88));
  console.log(`  ICC(3,1) on total_score_0_10, n=${irr.n} complete cells: ${irr.icc31}`);
  console.log(`  ${irr.iccNote}`);

  console.log("\n" + "=".repeat(88));
  console.log("COPYABLE TABLE  (SD shown is SAMPLE SD, n-1 — see note below)");
  console.log("=".repeat(88));
  const header =
    "Group | n | Baseline mean (95% CI) | CRAFT mean (95% CI) | Delta (95% CI) | t-test p | Wilcoxon p | d_z | % both 10/10";
  console.log(header);
  for (const g of groups) {
    console.log(
      `${g.label} | ${g.n} | ${fmtCi(g.baselineMean, g.baselineCi)} | ${fmtCi(g.craftMean, g.craftCi)} | ` +
        `${fmtCi(g.deltaMean, g.deltaCi)} | ${fmtP(g.tP)} | ${fmtP(g.wilcoxonP)} | ` +
        `${Number.isNaN(g.dz) ? "n/a" : g.dz.toFixed(2)} | ${g.pctBothTen.toFixed(0)}%`
    );
  }
  console.log(
    "\nNote: lib/results.ts's own stddev() (shown on the Results page as 'SD across\n" +
      "paired cells') is POPULATION SD (divide by n). The SD folded into the 95% CI\n" +
      "and Cohen's d_z above is SAMPLE SD (divide by n-1), the standard convention for\n" +
      "inferential statistics. The two will differ slightly; this does not indicate a\n" +
      "mismatch with the app, just a different (and both legitimate) SD convention."
  );

  // ============================================================
  // MAIN-RUN-ONLY variant — scripts/checkpoint.ts's pairing rule:
  // run_type === "main" only, no stability repeats folded in.
  // Same primary-judge / stale / incomplete filters as above.
  // ============================================================
  console.log("\n" + "=".repeat(88));
  console.log("MAIN-RUN-ONLY  (run_type === \"main\" only — scripts/checkpoint.ts's pairing)");
  console.log("=".repeat(88));

  const mainFiltered = filtered.filter((s) => s.result.run_type === "main");
  const mainUnits = pairedUnits(mainFiltered, totalOf);
  const mainPooledCheck = pairedStats(mainUnits);
  console.log(
    `\napp's pairedStats() on main-only units: n=${mainPooledCheck.nPairs}, delta=${mainPooledCheck.delta}`
  );

  const mainGroups: GroupReport[] = [];
  for (const model of models) {
    mainGroups.push(reportGroup(model, mainUnits.filter((u) => u.model_name === model)));
  }
  mainGroups.push(reportGroup("POOLED (both models)", mainUnits));

  console.log("\n" + "-".repeat(88));
  console.log("MAIN-ONLY PER-MODEL AND POOLED PAIRED STATISTICS");
  console.log("-".repeat(88));
  for (const g of mainGroups) printGroup(g);

  console.log("\n" + "=".repeat(88));
  console.log("MAIN-ONLY COPYABLE TABLE  (SD shown is SAMPLE SD, n-1)");
  console.log("=".repeat(88));
  console.log(header);
  for (const g of mainGroups) {
    console.log(
      `${g.label} | ${g.n} | ${fmtCi(g.baselineMean, g.baselineCi)} | ${fmtCi(g.craftMean, g.craftCi)} | ` +
        `${fmtCi(g.deltaMean, g.deltaCi)} | ${fmtP(g.tP)} | ${fmtP(g.wilcoxonP)} | ` +
        `${Number.isNaN(g.dz) ? "n/a" : g.dz.toFixed(2)} | ${g.pctBothTen.toFixed(0)}%`
    );
  }

  console.log(`\nMain-only overall baseline mean (pooled, both models): ${mainGroups[mainGroups.length - 1].baselineMean.toFixed(2)}`);

  // -------------------------------------------------- MAIN-ONLY DOMAIN TABLE
  console.log("\n" + "-".repeat(88));
  console.log("MAIN-ONLY DOMAIN TABLE  (n, baseline mean, CRAFT mean, delta — pooled across models)");
  console.log("-".repeat(88));
  const domains = Array.from(new Set(tasks.map((t) => t.domain))) as Domain[];
  console.log(`${"domain".padEnd(16)} ${"n".padEnd(5)} ${"baseline".padEnd(10)} ${"craft".padEnd(10)} delta`);
  for (const domain of domains) {
    const taskIdsInDomain = new Set(tasks.filter((t) => t.domain === domain).map((t) => t.task_id));
    const domainUnits = mainUnits.filter((u) => taskIdsInDomain.has(u.task_id));
    const stats = pairedStats(domainUnits);
    const deltaStr = `${stats.delta >= 0 ? "+" : ""}${stats.delta}`;
    console.log(
      `${domain.padEnd(16)} ${String(stats.nPairs).padEnd(5)} ${stats.meanBaseline.toFixed(2).padEnd(10)} ` +
        `${stats.meanCraft.toFixed(2).padEnd(10)} ${deltaStr}`
    );
  }
}

main();
