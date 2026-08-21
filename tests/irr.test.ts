import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { computeIcc31, computeIrr, DISAGREEMENT_THRESHOLD } from "../lib/irr.ts";
import { joinResults } from "../lib/resultsJoin.ts";

function makeResult(id: string, overrides: Record<string, unknown> = {}) {
  return {
    result_id: id,
    task_id: "T001",
    task_version: "v1-abc",
    model_name: "claude-sonnet-5",
    model_provenance_fingerprint: "fp",
    prompt_condition: "baseline" as const,
    run_number: 1,
    run_type: "main" as const,
    decoding_params: { temperature: null, effort: null },
    max_tokens: 4000,
    system_prompt: "sys",
    run_settings_hash: "rs2-abc",
    run_settings_fields: ["temperature", "max_tokens", "system_prompt", "effort"],
    run_date: "2026-08-21T00:00:00.000Z",
    raw_model_output: "out",
    anonymized_output_id: "OUT-0001",
    truncated: false,
    reasoning_tokens: null,
    notes: "",
    ...overrides,
  };
}

function makeEval(
  resultId: string,
  isPrimary: boolean,
  total: number,
  parts = { c: 3, l: 3, k: 2 }
) {
  return {
    evaluation_id: `${resultId}-${isPrimary ? "P" : "S"}`,
    result_id: resultId,
    evaluator_model: isPrimary ? "gemini-3.7-flash" : "gpt-5.5-2026-04-23",
    evaluator_provenance_fingerprint: "fp",
    is_primary: isPrimary,
    evaluated_at: "2026-08-21T00:00:00.000Z",
    constraint_adherence_score_0_4: parts.c,
    logical_accuracy_score_0_4: parts.l,
    completeness_score_0_2: parts.k,
    total_score_0_10: total,
    evaluator_justification: "j",
  };
}

describe("C1 — primary-judge-only scoring", () => {
  test("primaryTotal is the primary judge's score, not an average", () => {
    const [scored] = joinResults(
      [makeResult("R1")],
      [makeEval("R1", true, 8), makeEval("R1", false, 10)]
    );
    assert.equal(scored.primaryTotal, 8);
    assert.notEqual(scored.primaryTotal, 9);
  });

  test("two primaries is not a complete cell", () => {
    const [scored] = joinResults(
      [makeResult("R1")],
      [makeEval("R1", true, 8), { ...makeEval("R1", true, 9), evaluation_id: "R1-P2" }]
    );
    assert.equal(scored.isComplete, false);
  });

  test("secondary alone leaves primaryTotal null", () => {
    const [scored] = joinResults([makeResult("R1")], [makeEval("R1", false, 10)]);
    assert.equal(scored.primaryTotal, null);
    assert.equal(scored.isComplete, false);
  });
});

describe("C2 — ICC(3,1)", () => {
  test("perfect agreement approaches 1", () => {
    const icc = computeIcc31([
      [2, 2],
      [5, 5],
      [8, 8],
      [10, 10],
    ]);
    assert.ok(icc !== null && icc > 0.99, `expected ~1, got ${icc}`);
  });

  test("constant judge offset still scores high — consistency, not absolute", () => {
    // Secondary is uniformly 1 point higher. ICC(3,1) excludes fixed judge
    // bias from the error term, so consistency remains high.
    const icc = computeIcc31([
      [2, 3],
      [5, 6],
      [8, 9],
      [10, 11],
    ]);
    assert.ok(icc !== null && icc > 0.9, `expected high consistency, got ${icc}`);
  });

  test("inverted ranking gives a negative coefficient", () => {
    const icc = computeIcc31([
      [1, 10],
      [3, 8],
      [8, 3],
      [10, 1],
    ]);
    assert.ok(icc !== null && icc < 0, `expected negative, got ${icc}`);
  });

  test("fewer than two subjects is not estimable", () => {
    assert.equal(computeIcc31([[5, 5]]), null);
    assert.equal(computeIcc31([]), null);
  });
});

describe("C2 — agreement metrics and disagreement listing", () => {
  const results = [makeResult("R1"), makeResult("R2"), makeResult("R3")];
  const evaluations = [
    makeEval("R1", true, 9, { c: 4, l: 3, k: 2 }),
    makeEval("R1", false, 9, { c: 4, l: 3, k: 2 }), // exact match
    makeEval("R2", true, 8, { c: 3, l: 3, k: 2 }),
    makeEval("R2", false, 6, { c: 2, l: 2, k: 2 }), // diff 2 — at threshold
    makeEval("R3", true, 9, { c: 4, l: 3, k: 2 }),
    makeEval("R3", false, 4, { c: 1, l: 1, k: 2 }), // diff 5 — over threshold
  ];
  const irr = computeIrr(joinResults(results, evaluations));

  test("n counts only complete runs", () => {
    assert.equal(irr.n, 3);
  });

  test("percent exact agreement on total", () => {
    const total = irr.metrics.find((m) => m.metric === "total_score_0_10")!;
    assert.equal(total.percentExactAgreement, 33.3);
  });

  test("mean absolute difference on total", () => {
    const total = irr.metrics.find((m) => m.metric === "total_score_0_10")!;
    // |9-9| + |8-6| + |9-4| = 0 + 2 + 5 = 7; 7/3 = 2.333
    assert.equal(total.meanAbsoluteDifference, 2.333);
  });

  test("all four metrics reported", () => {
    assert.deepEqual(
      irr.metrics.map((m) => m.metric),
      [
        "constraint_adherence_score_0_4",
        "logical_accuracy_score_0_4",
        "completeness_score_0_2",
        "total_score_0_10",
      ]
    );
  });

  test("only differences strictly greater than 2 are listed", () => {
    assert.equal(DISAGREEMENT_THRESHOLD, 2);
    assert.equal(irr.largeDisagreements.length, 1);
    assert.equal(irr.largeDisagreements[0].result_id, "R3");
    assert.equal(irr.largeDisagreements[0].difference, 5);
  });

  test("disagreement rows name both judges", () => {
    const row = irr.largeDisagreements[0];
    assert.equal(row.primary_model, "gemini-3.7-flash");
    assert.equal(row.secondary_model, "gpt-5.5-2026-04-23");
  });

  test("incomplete runs are excluded from IRR", () => {
    const partial = computeIrr(
      joinResults([makeResult("R9")], [makeEval("R9", true, 7)])
    );
    assert.equal(partial.n, 0);
  });
});
