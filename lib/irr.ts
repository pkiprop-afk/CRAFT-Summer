import type { ScoredResult } from "@/lib/resultsJoin";

/**
 * C2 — Inter-rater reliability.
 *
 * The secondary judge exists to quantify how much the score depends on who is
 * judging. That is a reported statistic, not an optional view, and it is the
 * reason default aggregates never average the two judges.
 *
 * Only complete runs (one primary, one secondary) contribute.
 */

export interface MetricAgreement {
  metric: string;
  max: number;
  n: number;
  /** Share of runs where both judges gave the identical score. */
  percentExactAgreement: number;
  /** Mean |primary - secondary|. */
  meanAbsoluteDifference: number;
}

export interface DisagreementRow {
  result_id: string;
  task_id: string;
  model_name: string;
  prompt_condition: string;
  run_type: string;
  primary_model: string;
  secondary_model: string;
  primary_total: number;
  secondary_total: number;
  difference: number;
}

export interface IrrReport {
  n: number;
  metrics: MetricAgreement[];
  /** ICC(3,1) on total_score_0_10. Null when it is not estimable. */
  icc31: number | null;
  iccNote: string;
  /** Runs where the two judges differ by more than 2 points on the total. */
  largeDisagreements: DisagreementRow[];
  disagreementThreshold: number;
}

export const DISAGREEMENT_THRESHOLD = 2;

function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const METRICS: Array<{
  metric: string;
  max: number;
  pick: (e: { constraint_adherence_score_0_4: number; logical_accuracy_score_0_4: number; completeness_score_0_2: number; total_score_0_10: number }) => number;
}> = [
  { metric: "constraint_adherence_score_0_4", max: 4, pick: (e) => e.constraint_adherence_score_0_4 },
  { metric: "logical_accuracy_score_0_4", max: 4, pick: (e) => e.logical_accuracy_score_0_4 },
  { metric: "completeness_score_0_2", max: 2, pick: (e) => e.completeness_score_0_2 },
  { metric: "total_score_0_10", max: 10, pick: (e) => e.total_score_0_10 },
];

/**
 * ICC(3,1) — two-way MIXED effects, single rater, absolute... no: consistency.
 *
 * Model (3,k=1) treats the judges as FIXED and named (gemini-2.5-pro plus the
 * rotating secondary), not a random sample from a population of judges, which
 * matches this design: there is no intent to generalize to other judges.
 *
 *   ICC(3,1) = (MSR - MSE) / (MSR + (k-1) * MSE),  k = 2 raters
 *
 * where MSR is the between-subject mean square and MSE the residual mean
 * square from a two-way ANOVA without the judge main effect in the denominator.
 * Because judges are fixed, systematic judge bias is excluded from the error
 * term — ICC(3,1) measures consistency, not absolute agreement.
 */
export function computeIcc31(pairs: Array<[number, number]>): number | null {
  const n = pairs.length;
  const k = 2;
  if (n < 2) return null;

  const grandMean = pairs.flat().reduce((s, v) => s + v, 0) / (n * k);
  const rowMeans = pairs.map(([a, b]) => (a + b) / 2);
  const colMeans = [
    pairs.reduce((s, [a]) => s + a, 0) / n,
    pairs.reduce((s, [, b]) => s + b, 0) / n,
  ];

  // Between-subject (rows)
  const ssRows = k * rowMeans.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  // Between-judge (columns) — a fixed effect here
  const ssCols = n * colMeans.reduce((s, m) => s + (m - grandMean) ** 2, 0);

  let ssTotal = 0;
  pairs.forEach(([a, b], i) => {
    ssTotal += (a - grandMean) ** 2 + (b - grandMean) ** 2;
    void i;
  });

  const ssError = ssTotal - ssRows - ssCols;

  const msRows = ssRows / (n - 1);
  const msError = ssError / ((n - 1) * (k - 1));

  const denominator = msRows + (k - 1) * msError;
  if (denominator === 0) return null;

  const icc = (msRows - msError) / denominator;
  // Degenerate inputs (e.g. every score identical) can produce values outside
  // [-1, 1] through floating point; clamp rather than report nonsense.
  if (!Number.isFinite(icc)) return null;
  return round(Math.max(-1, Math.min(1, icc)));
}

export function computeIrr(scored: ScoredResult[]): IrrReport {
  const complete = scored.filter((s) => s.primary !== null && s.secondary !== null);

  const metrics: MetricAgreement[] = METRICS.map(({ metric, max, pick }) => {
    const diffs: number[] = [];
    let exact = 0;
    for (const s of complete) {
      const p = pick(s.primary!);
      const q = pick(s.secondary!);
      if (p === q) exact++;
      diffs.push(Math.abs(p - q));
    }
    return {
      metric,
      max,
      n: complete.length,
      percentExactAgreement:
        complete.length === 0 ? 0 : round((exact / complete.length) * 100, 1),
      meanAbsoluteDifference:
        diffs.length === 0 ? 0 : round(diffs.reduce((s, d) => s + d, 0) / diffs.length),
    };
  });

  const totalPairs: Array<[number, number]> = complete.map((s) => [
    s.primary!.total_score_0_10,
    s.secondary!.total_score_0_10,
  ]);

  const largeDisagreements: DisagreementRow[] = complete
    .map((s) => ({
      result_id: s.result.result_id,
      task_id: s.result.task_id,
      model_name: s.result.model_name,
      prompt_condition: s.result.prompt_condition,
      run_type: s.result.run_type,
      primary_model: s.primary!.evaluator_model,
      secondary_model: s.secondary!.evaluator_model,
      primary_total: s.primary!.total_score_0_10,
      secondary_total: s.secondary!.total_score_0_10,
      difference: Math.abs(s.primary!.total_score_0_10 - s.secondary!.total_score_0_10),
    }))
    .filter((row) => row.difference > DISAGREEMENT_THRESHOLD)
    .sort((a, b) => b.difference - a.difference);

  return {
    n: complete.length,
    metrics,
    icc31: computeIcc31(totalPairs),
    iccNote:
      "ICC(3,1): two-way mixed, single measure, consistency. Judges are fixed and " +
      "named, not a random sample — results do not generalize to other judges.",
    largeDisagreements,
    disagreementThreshold: DISAGREEMENT_THRESHOLD,
  };
}
