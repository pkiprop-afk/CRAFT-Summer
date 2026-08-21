import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeRunSettingsHash,
  diffRunSettings,
  DEFAULT_MAX_TOKENS,
} from "../lib/runSettings.ts";
import { isUnpairedScope, PAIRED_SCOPE } from "../lib/batch.ts";
import { joinResults, REQUIRED_JUDGES_PER_RESULT } from "../lib/resultsJoin.ts";
import { RESULTS_COLUMNS, EVALUATIONS_COLUMNS } from "../lib/exportShape.ts";

describe("5a — run settings binding", () => {
  const base = { temperature: 0.2, max_tokens: 4000, system_prompt: "You are helpful." };

  test("identical settings hash identically", async () => {
    assert.equal(await computeRunSettingsHash(base), await computeRunSettingsHash({ ...base }));
  });

  test("each covered field changes the hash", async () => {
    const original = await computeRunSettingsHash(base);
    assert.notEqual(await computeRunSettingsHash({ ...base, temperature: 0.7 }), original);
    assert.notEqual(await computeRunSettingsHash({ ...base, max_tokens: 2000 }), original);
    assert.notEqual(await computeRunSettingsHash({ ...base, system_prompt: "Other" }), original);
  });

  test("mismatch names the field and its earlier value", () => {
    const mismatches = diffRunSettings(base, { ...base, temperature: 0.7 });
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].field, "temperature");
    assert.equal(mismatches[0].earlier_value, "0.2");
    assert.equal(mismatches[0].attempted_value, "0.7");
  });

  test("identical settings report no mismatch", () => {
    assert.deepEqual(diffRunSettings(base, { ...base }), []);
  });
});

describe("5b — execution-layer pairing", () => {
  test("both is the paired scope", () => {
    assert.equal(PAIRED_SCOPE, "both");
    assert.equal(isUnpairedScope("both"), false);
  });

  test("single-condition scopes are unpaired", () => {
    assert.equal(isUnpairedScope("baseline"), true);
    assert.equal(isUnpairedScope("craft"), true);
  });
});

describe("5c — truncation defaults", () => {
  test("default max_tokens raised to 4000", () => {
    assert.equal(DEFAULT_MAX_TOKENS, 4000);
  });
});

describe("two-evaluations-per-result rule", () => {
  const result = {
    result_id: "RES-1",
    task_id: "T001",
    task_version: "v1-abc",
    model_name: "claude-sonnet-5",
    model_provenance_fingerprint: "created_at:2026-06-29T00:00:00Z",
    prompt_condition: "baseline" as const,
    run_number: 1,
    run_type: "benchmark" as const,
    temperature: 0.2,
    max_tokens: 4000,
    system_prompt: "You are helpful.",
    run_settings_hash: "rs1-abc",
    run_date: "2026-08-21T00:00:00.000Z",
    raw_model_output: "output",
    anonymized_output_id: "OUT-0001",
    truncated: false,
    notes: "",
  };

  const evaluation = (id: string, judge: string, isPrimary: boolean) => ({
    evaluation_id: id,
    result_id: "RES-1",
    evaluator_model: judge,
    evaluator_provenance_fingerprint: "fp",
    is_primary: isPrimary,
    evaluated_at: "2026-08-21T00:00:00.000Z",
    constraint_adherence_score_0_4: 3,
    logical_accuracy_score_0_4: 4,
    completeness_score_0_2: 2,
    total_score_0_10: 9,
    evaluator_justification: "ok",
  });

  test("requires two judges", () => {
    assert.equal(REQUIRED_JUDGES_PER_RESULT, 2);
  });

  test("an unevaluated run is incomplete with null scores, not zero", () => {
    const [scored] = joinResults([result], []);
    assert.equal(scored.isComplete, false);
    assert.equal(scored.meanTotal, null);
  });

  test("a singly-judged run is incomplete", () => {
    const [scored] = joinResults([result], [evaluation("E1", "gemini-2.5-pro", true)]);
    assert.equal(scored.isComplete, false);
  });

  test("two judges complete the cell and average", () => {
    const [scored] = joinResults(
      [result],
      [
        { ...evaluation("E1", "gemini-2.5-pro", true), total_score_0_10: 8 },
        { ...evaluation("E2", "gpt-5.5-2026-04-23", false), total_score_0_10: 10 },
      ]
    );
    assert.equal(scored.isComplete, true);
    assert.equal(scored.meanTotal, 9);
  });
});

describe("export shape", () => {
  test("results columns match the J3 order exactly", () => {
    assert.deepEqual(
      [...RESULTS_COLUMNS],
      [
        "result_id",
        "task_id",
        "task_version",
        "model_name",
        "model_provenance_fingerprint",
        "prompt_condition",
        "run_number",
        "run_type",
        "temperature",
        "max_tokens",
        "system_prompt",
        "run_settings_hash",
        "run_date",
        "raw_model_output",
        "anonymized_output_id",
        "truncated",
        "notes",
      ]
    );
  });

  test("evaluations columns match the J3 order exactly", () => {
    assert.deepEqual(
      [...EVALUATIONS_COLUMNS],
      [
        "evaluation_id",
        "result_id",
        "evaluator_model",
        "evaluator_provenance_fingerprint",
        "is_primary",
        "evaluated_at",
        "constraint_adherence_score_0_4",
        "logical_accuracy_score_0_4",
        "completeness_score_0_2",
        "total_score_0_10",
        "evaluator_justification",
      ]
    );
  });

  test("no evaluator field remains on the results shape", () => {
    for (const col of RESULTS_COLUMNS) {
      assert.ok(
        !col.startsWith("evaluator_") && !col.includes("_score_"),
        `results export still carries evaluation column ${col}`
      );
    }
  });
});
