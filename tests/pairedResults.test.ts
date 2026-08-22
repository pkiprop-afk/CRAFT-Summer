import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pairByCell, pairedStats, pairedUnits } from "../lib/results.ts";
import type { ScoredResult } from "../lib/resultsJoin.ts";

const scored = (
  task: string,
  model: string,
  condition: "baseline" | "craft",
  total: number | null,
  runNumber = 1
): ScoredResult =>
  ({
    result: {
      result_id: `${task}-${model}-${condition}-${runNumber}`,
      task_id: task,
      model_name: model,
      prompt_condition: condition,
      run_number: runNumber,
      run_type: "main",
    },
    evaluations: [],
    primary: null,
    secondary: null,
    isComplete: true,
    primaryTotal: total,
    primaryConstraint: null,
    primaryLogical: null,
    primaryCompleteness: null,
  }) as unknown as ScoredResult;

const totalOf = (s: ScoredResult) => s.primaryTotal;
const CLAUDE = "claude-sonnet-5";
const GPT = "gpt-5.5-2026-04-23";

describe("R1 — paired aggregation over task x model cells", () => {
  test("a cell with only one condition contributes to NEITHER mean", () => {
    // T1 complete pair; T2 baseline only. The old aggregation would put T2's
    // baseline 10 into the baseline mean and nothing into craft, comparing
    // means over different task sets.
    const units = pairedUnits(
      [
        scored("T1", CLAUDE, "baseline", 8),
        scored("T1", CLAUDE, "craft", 6),
        scored("T2", CLAUDE, "baseline", 10),
      ],
      totalOf
    );
    const stats = pairedStats(units);
    assert.equal(stats.nPairs, 1);
    assert.equal(stats.meanBaseline, 8, "T2's unpaired baseline must be excluded");
    assert.equal(stats.meanCraft, 6);
    assert.equal(stats.delta, -2);
  });

  test("there is exactly one n — per-condition counts cannot differ", () => {
    const stats = pairedStats(
      pairedUnits(
        [
          scored("T1", CLAUDE, "baseline", 8),
          scored("T1", CLAUDE, "craft", 7),
          scored("T2", CLAUDE, "baseline", 9),
          scored("T3", CLAUDE, "craft", 9),
        ],
        totalOf
      )
    );
    assert.equal(stats.nPairs, 1);
    // The stats object deliberately has no per-condition n to diverge.
    assert.ok(!("nBaseline" in stats) && !("nCraft" in stats));
  });

  test("the two models are separate cells, never pooled as repeat runs", () => {
    const cells = pairByCell([
      scored("T1", CLAUDE, "baseline", 10),
      scored("T1", GPT, "baseline", 2),
      scored("T1", CLAUDE, "craft", 10),
      scored("T1", GPT, "craft", 2),
    ]);
    assert.equal(cells.length, 2, "one task under two models is two cells");

    const units = pairedUnits(
      [
        scored("T1", CLAUDE, "baseline", 10),
        scored("T1", GPT, "baseline", 2),
        scored("T1", CLAUDE, "craft", 10),
        scored("T1", GPT, "craft", 2),
      ],
      totalOf
    );
    assert.equal(units.length, 2);
    // Within each cell there is one run, so within-cell spread is zero; the
    // claude-vs-gpt difference shows up ACROSS cells, where it belongs.
    const stats = pairedStats(units);
    assert.equal(stats.meanBaseline, 6);
    assert.equal(stats.sdAcrossBaseline, 4, "between-model spread is across-cell dispersion");
  });

  test("a model with a missing craft cell drops that cell for BOTH conditions", () => {
    // Claude pair complete; GPT baseline exists but GPT craft is missing.
    const units = pairedUnits(
      [
        scored("T1", CLAUDE, "baseline", 8),
        scored("T1", CLAUDE, "craft", 8),
        scored("T1", GPT, "baseline", 2),
      ],
      totalOf
    );
    const stats = pairedStats(units);
    assert.equal(stats.nPairs, 1);
    assert.equal(stats.meanBaseline, 8, "GPT's unpaired baseline 2 must not deflate baseline");
    assert.equal(stats.delta, 0);
  });

  test("null scores do not qualify a cell", () => {
    const units = pairedUnits(
      [scored("T1", CLAUDE, "baseline", 8), scored("T1", CLAUDE, "craft", null)],
      totalOf
    );
    assert.equal(units.length, 0);
  });

  test("repeat runs average within the cell before pairing", () => {
    const units = pairedUnits(
      [
        scored("T1", CLAUDE, "baseline", 6, 1),
        scored("T1", CLAUDE, "baseline", 10, 2),
        scored("T1", CLAUDE, "craft", 7, 1),
      ],
      totalOf
    );
    assert.equal(units.length, 1);
    assert.equal(units[0].baseline, 8, "cell mean over repeats");
    assert.equal(units[0].baselineRuns, 2);
    assert.equal(units[0].craftRuns, 1);
  });

  test("delta equals the mean of per-pair deltas", () => {
    const stats = pairedStats(
      pairedUnits(
        [
          scored("T1", CLAUDE, "baseline", 10),
          scored("T1", CLAUDE, "craft", 7),
          scored("T2", CLAUDE, "baseline", 6),
          scored("T2", CLAUDE, "craft", 9),
        ],
        totalOf
      )
    );
    assert.equal(stats.delta, 0, "(-3 + 3) / 2");
    assert.equal(stats.sdDelta, 3);
  });

  test("empty input yields zeroed stats, not NaN", () => {
    const stats = pairedStats([]);
    assert.equal(stats.nPairs, 0);
    assert.equal(stats.meanBaseline, 0);
    assert.ok(Number.isFinite(stats.sdDelta));
  });
});
