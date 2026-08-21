import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeRunSettingsHash,
  diffRunSettings,
  DEFAULT_MAX_TOKENS,
} from "../lib/runSettings.ts";
import { isUnpairedScope, PAIRED_SCOPE } from "../lib/batch.ts";
import { decodingParamsFor } from "../lib/decoding.ts";
import { joinResults, REQUIRED_JUDGES_PER_RESULT } from "../lib/resultsJoin.ts";
import { RESULTS_COLUMNS, EVALUATIONS_COLUMNS } from "../lib/exportShape.ts";

describe("5a — run settings binding", () => {
  const base = { temperature: null, max_tokens: 4000, system_prompt: "You are helpful." };

  test("identical settings hash identically", async () => {
    const a = await computeRunSettingsHash(base);
    const b = await computeRunSettingsHash({ ...base });
    assert.equal(a.hash, b.hash);
    assert.deepEqual(a.fields, b.fields);
  });

  test("each covered field changes the hash", async () => {
    const original = (await computeRunSettingsHash(base)).hash;
    assert.notEqual((await computeRunSettingsHash({ ...base, temperature: 1.0 })).hash, original);
    assert.notEqual((await computeRunSettingsHash({ ...base, max_tokens: 2000 })).hash, original);
    assert.notEqual(
      (await computeRunSettingsHash({ ...base, system_prompt: "Other" })).hash,
      original
    );
  });

  test("mismatch names the field and its earlier value", () => {
    const earlier = { ...base, max_tokens: 4000 };
    const mismatches = diffRunSettings(earlier, { ...earlier, max_tokens: 2000 });
    assert.equal(mismatches.length, 1);
    assert.equal(mismatches[0].field, "max_tokens");
    assert.equal(mismatches[0].earlier_value, "4000");
    assert.equal(mismatches[0].attempted_value, "2000");
  });

  test("identical settings report no mismatch", () => {
    assert.deepEqual(diffRunSettings(base, { ...base }), []);
  });
});

describe("G2/G3/G4 — per-model decoding and field-set-aware hashing", () => {
  test("Claude decoding: temperature null, effort unset — 0.2 never used", () => {
    const p = decodingParamsFor("claude-sonnet-5");
    assert.deepEqual(p, { temperature: null, effort: null });
    assert.notEqual(p.temperature, 0.2);
  });

  test("GPT decoding: temperature 1.0 pinned, reasoning_effort low", () => {
    const p = decodingParamsFor("gpt-5.5-2026-04-23");
    assert.deepEqual(p, { temperature: 1.0, reasoning_effort: "low" });
    assert.notEqual(p.temperature, 0.2);
  });

  test("field sets differ by model and are recorded", async () => {
    const claude = await computeRunSettingsHash({
      temperature: null,
      max_tokens: 4000,
      system_prompt: "s",
      effort: null,
    });
    const gpt = await computeRunSettingsHash({
      temperature: 1.0,
      max_tokens: 4000,
      system_prompt: "s",
      reasoning_effort: "low",
    });

    assert.deepEqual(claude.fields, [
      "temperature",
      "max_tokens",
      "system_prompt",
      "effort",
    ]);
    assert.deepEqual(gpt.fields, [
      "temperature",
      "max_tokens",
      "system_prompt",
      "reasoning_effort",
    ]);
    assert.notDeepEqual(claude.fields, gpt.fields);
  });

  test("different field sets cannot collide even with equal shared values", async () => {
    // Same temperature/max_tokens/system_prompt, different effort field name.
    const a = await computeRunSettingsHash({
      temperature: null,
      max_tokens: 4000,
      system_prompt: "s",
      effort: null,
    });
    const b = await computeRunSettingsHash({
      temperature: null,
      max_tokens: 4000,
      system_prompt: "s",
      reasoning_effort: null,
    });
    assert.notEqual(a.hash, b.hash, "field set must be part of the hashed payload");
  });

  test("hash version marker changed with the field-set scheme", async () => {
    const { hash } = await computeRunSettingsHash({
      temperature: null,
      max_tokens: 4000,
      system_prompt: "s",
    });
    assert.ok(hash.startsWith("rs2-"), `expected rs2- prefix, got ${hash}`);
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
    run_type: "main" as const,
    decoding_params: { temperature: null, effort: null },
    max_tokens: 4000,
    system_prompt: "You are helpful.",
    run_settings_hash: "rs2-abc",
    run_settings_fields: ["temperature", "max_tokens", "system_prompt", "effort"],
    run_date: "2026-08-21T00:00:00.000Z",
    raw_model_output: "output",
    anonymized_output_id: "OUT-0001",
    truncated: false,
    reasoning_tokens: null,
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
    assert.equal(scored.primaryTotal, null);
  });

  test("a singly-judged run is incomplete", () => {
    const [scored] = joinResults([result], [evaluation("E1", "gemini-2.5-pro", true)]);
    assert.equal(scored.isComplete, false);
  });

  test("two judges complete the cell; score is the PRIMARY, not an average", () => {
    const [scored] = joinResults(
      [result],
      [
        { ...evaluation("E1", "gemini-2.5-pro", true), total_score_0_10: 8 },
        { ...evaluation("E2", "gpt-5.5-2026-04-23", false), total_score_0_10: 10 },
      ]
    );
    assert.equal(scored.isComplete, true);
    assert.equal(scored.primaryTotal, 8);
    assert.equal(scored.secondary?.total_score_0_10, 10);
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
        "decoding_params",
        "max_tokens",
        "system_prompt",
        "run_settings_hash",
        "run_settings_fields",
        "run_date",
        "raw_model_output",
        "anonymized_output_id",
        "truncated",
        "reasoning_tokens",
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
