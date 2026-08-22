import type { ScoredResult } from "@/lib/resultsJoin";

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * R1 — PAIRED aggregation.
 *
 * The study is a within-task paired comparison, so the unit of analysis is one
 * CELL of the design: task x model. A cell contributes to any aggregate only
 * when BOTH of its conditions have a usable score; a task with a complete
 * baseline and a missing craft is excluded from BOTH means, not just one.
 *
 * The previous aggregation computed each condition's mean over whatever tasks
 * had that condition — so the two means could cover different task sets, and
 * the delta between them was not a paired difference. It also grouped by
 * task_id alone, which pooled the two test models' runs as if they were repeat
 * runs of one task; the between-model spread then surfaced mislabeled as
 * "run-to-run" SD (R2). Pairing at task x model removes both defects.
 *
 * By construction nBaseline === nCraft === pairs.length. There is deliberately
 * no way to read a per-condition n out of PairedStats: if the two counts could
 * ever differ, that would be a bug by definition.
 */
export interface PairedUnit {
  task_id: string;
  model_name: string;
  /** Per-cell means over run repeats (n=1 in the main study; 1..k in stability). */
  baseline: number;
  craft: number;
  baselineRuns: number;
  craftRuns: number;
}

interface CellGroup {
  task_id: string;
  model_name: string;
  baseline: ScoredResult[];
  craft: ScoredResult[];
}

/** Groups runs into task x model cells without collapsing repeats. */
export function pairByCell(scored: ScoredResult[]): CellGroup[] {
  const map = new Map<string, CellGroup>();
  for (const s of scored) {
    const key = `${s.result.task_id}::${s.result.model_name}`;
    const entry =
      map.get(key) ??
      ({
        task_id: s.result.task_id,
        model_name: s.result.model_name,
        baseline: [],
        craft: [],
      } satisfies CellGroup);
    entry[s.result.prompt_condition].push(s);
    map.set(key, entry);
  }
  return [...map.values()];
}

/**
 * Reduces cells to paired units under a score accessor. A cell qualifies only
 * when both conditions have at least one non-null score; each side is the mean
 * over its repeats, so a cell with more repeat runs does not outweigh one with
 * fewer.
 */
export function pairedUnits(
  scored: ScoredResult[],
  scoreOf: (s: ScoredResult) => number | null
): PairedUnit[] {
  const units: PairedUnit[] = [];
  for (const cell of pairByCell(scored)) {
    const b = cell.baseline.map(scoreOf).filter((v): v is number => v !== null);
    const c = cell.craft.map(scoreOf).filter((v): v is number => v !== null);
    if (b.length === 0 || c.length === 0) continue;
    units.push({
      task_id: cell.task_id,
      model_name: cell.model_name,
      baseline: mean(b),
      craft: mean(c),
      baselineRuns: b.length,
      craftRuns: c.length,
    });
  }
  return units;
}

export interface PairedStats {
  /** Number of paired units — the ONLY n. Identical for both conditions. */
  nPairs: number;
  meanBaseline: number;
  meanCraft: number;
  /** mean(craft - baseline) over pairs == meanCraft - meanBaseline. */
  delta: number;
  /**
   * R2 — dispersion of per-unit scores ACROSS cells, not run-to-run
   * consistency. In the main study every cell is a single run, so there is no
   * run-to-run variance to report; that statistic belongs to the stability
   * subset alone.
   */
  sdAcrossBaseline: number;
  sdAcrossCraft: number;
  /** SD of the per-unit deltas — the paired-design spread of the effect. */
  sdDelta: number;
}

export function pairedStats(units: PairedUnit[]): PairedStats {
  const b = units.map((u) => u.baseline);
  const c = units.map((u) => u.craft);
  const d = units.map((u) => u.craft - u.baseline);
  return {
    nPairs: units.length,
    meanBaseline: round(mean(b)),
    meanCraft: round(mean(c)),
    delta: round(mean(d)),
    sdAcrossBaseline: round(stddev(b)),
    sdAcrossCraft: round(stddev(c)),
    sdDelta: round(stddev(d)),
  };
}
