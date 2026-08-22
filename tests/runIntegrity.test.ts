import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeRunSettingsHash,
  diffRunSettings,
  DEFAULT_MAX_TOKENS,
} from "../lib/runSettings.ts";
import {
  buildBatchJobs,
  CHECKPOINT_AFTER_GENERATIONS,
  isUnpairedScope,
  PAIRED_SCOPE,
} from "../lib/batch.ts";
import { runWithConcurrency } from "../lib/concurrency.ts";
import { claimRunNumber, runNumberKey, seedRunNumberCounts } from "../lib/runNumber.ts";
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

describe("run_number is scoped per cell, model included", () => {
  const scope = (model: string, condition = "baseline", run_type = "main") =>
    ({
      task_id: "T001",
      model_name: model,
      prompt_condition: condition,
      run_type,
    }) as Parameters<typeof claimRunNumber>[1];

  test("two models on the same task+condition BOTH get run_number 1", () => {
    // The bug this pins: a shared counter made whichever model ran second
    // run_number 2, failing the n=1 parity check.
    const counts = new Map<string, number>();
    assert.equal(claimRunNumber(counts, scope("claude-sonnet-5")), 1);
    assert.equal(claimRunNumber(counts, scope("gpt-5.5-2026-04-23")), 1);
  });

  test("all four cells of one task are run 1", () => {
    const counts = new Map<string, number>();
    for (const m of ["claude-sonnet-5", "gpt-5.5-2026-04-23"]) {
      for (const c of ["baseline", "craft"]) {
        assert.equal(claimRunNumber(counts, scope(m, c)), 1, `${m}/${c}`);
      }
    }
  });

  test("a genuine repeat of the SAME cell still increments", () => {
    const counts = new Map<string, number>();
    assert.equal(claimRunNumber(counts, scope("claude-sonnet-5")), 1);
    assert.equal(claimRunNumber(counts, scope("claude-sonnet-5")), 2);
  });

  test("main and stability are separate series", () => {
    const counts = new Map<string, number>();
    assert.equal(claimRunNumber(counts, scope("claude-sonnet-5", "baseline", "main")), 1);
    assert.equal(claimRunNumber(counts, scope("claude-sonnet-5", "baseline", "stability")), 1);
  });

  test("seeding from existing results resumes each cell independently", () => {
    const existing = [
      { task_id: "T001", model_name: "claude-sonnet-5", prompt_condition: "baseline", run_type: "stability", run_number: 2 },
      { task_id: "T001", model_name: "gpt-5.5-2026-04-23", prompt_condition: "baseline", run_type: "stability", run_number: 1 },
    ] as Parameters<typeof seedRunNumberCounts>[0];
    const counts = seedRunNumberCounts(existing);
    assert.equal(claimRunNumber(counts, scope("claude-sonnet-5", "baseline", "stability")), 3);
    assert.equal(claimRunNumber(counts, scope("gpt-5.5-2026-04-23", "baseline", "stability")), 2);
    // An untouched cell is unaffected by the other model's history.
    assert.equal(claimRunNumber(counts, scope("claude-sonnet-5", "craft", "main")), 1);
  });

  test("the key distinguishes all four dimensions", () => {
    const keys = new Set(
      ["claude-sonnet-5", "gpt-5.5-2026-04-23"].flatMap((m) =>
        ["baseline", "craft"].flatMap((c) =>
          ["main", "stability"].map((t) => runNumberKey(scope(m, c, t)))
        )
      )
    );
    assert.equal(keys.size, 8, "every cell must key uniquely");
  });
});

describe("batch job ordering and the checkpoint boundary", () => {
  const MODELS = ["claude-sonnet-5", "gpt-5.5-2026-04-23"] as const;
  const mkTask = (id: string) =>
    ({
      task_id: id,
      domain: "coding",
      task_description: "d",
      baseline_prompt: "b",
      craft_prompt: "c",
    }) as unknown as Parameters<typeof buildBatchJobs>[0][number];

  const tasks = Array.from({ length: 50 }, (_, i) =>
    mkTask(`T${String(i + 1).padStart(3, "0")}`)
  );
  const allIds = new Set(tasks.map((t) => t.task_id));

  test("the full design is 200 jobs", () => {
    assert.equal(buildBatchJobs(tasks, allIds, "both", MODELS).length, 200);
  });

  test("ordering is task-major, then model, then condition", () => {
    const jobs = buildBatchJobs(tasks.slice(0, 2), new Set(["T001", "T002"]), "both", MODELS);
    assert.deepEqual(
      jobs.map((j) => `${j.task_id}/${j.model}/${j.condition}`),
      [
        "T001/claude-sonnet-5/baseline",
        "T001/claude-sonnet-5/craft",
        "T001/gpt-5.5-2026-04-23/baseline",
        "T001/gpt-5.5-2026-04-23/craft",
        "T002/claude-sonnet-5/baseline",
        "T002/claude-sonnet-5/craft",
        "T002/gpt-5.5-2026-04-23/baseline",
        "T002/gpt-5.5-2026-04-23/craft",
      ]
    );
  });

  test("the checkpoint prefix is exactly 25 whole tasks", () => {
    const jobs = buildBatchJobs(tasks, allIds, "both", MODELS);
    const prefix = jobs.slice(0, CHECKPOINT_AFTER_GENERATIONS);
    assert.equal(new Set(prefix.map((j) => j.task_id)).size, 25);
    // Nothing in the prefix may belong to a task that also appears after it.
    const after = new Set(jobs.slice(CHECKPOINT_AFTER_GENERATIONS).map((j) => j.task_id));
    for (const j of prefix) {
      assert.ok(!after.has(j.task_id), `${j.task_id} straddles the checkpoint boundary`);
    }
  });

  test("the checkpoint prefix holds whole pairs, balanced across models", () => {
    const jobs = buildBatchJobs(tasks, allIds, "both", MODELS);
    const prefix = jobs.slice(0, CHECKPOINT_AFTER_GENERATIONS);

    for (const model of MODELS) {
      const forModel = prefix.filter((j) => j.model === model);
      assert.equal(forModel.length, 50, `${model} should contribute 50 generations`);
      const baseline = forModel.filter((j) => j.condition === "baseline").map((j) => j.task_id);
      const craft = forModel.filter((j) => j.condition === "craft").map((j) => j.task_id);
      // Every baseline has its craft counterpart in the same prefix — no half pairs.
      assert.deepEqual(baseline.sort(), craft.sort());
      assert.equal(baseline.length, 25, `${model} should contribute 25 whole pairs`);
    }
  });

  test("the dispatch gate stops at exactly the boundary under concurrency", async () => {
    // The reason the gate is on dispatch index rather than completion count:
    // with limit > 1 the completion count lags dispatch, so a completion-based
    // boundary overshoots by up to limit-1 and can bisect a pair.
    for (const limit of [1, 3, 8]) {
      const ran: number[] = [];
      const outcome = await runWithConcurrency(
        Array.from({ length: 200 }, (_, i) => i),
        limit,
        async (item) => {
          ran.push(item);
          await new Promise((r) => setTimeout(r, 1));
        },
        {
          shouldDispatch: (nextIndex) => nextIndex < CHECKPOINT_AFTER_GENERATIONS,
        }
      );
      assert.equal(ran.length, CHECKPOINT_AFTER_GENERATIONS, `limit=${limit}`);
      assert.equal(outcome.aborted, true, `limit=${limit}`);
      assert.deepEqual(
        ran.sort((a, b) => a - b),
        Array.from({ length: CHECKPOINT_AFTER_GENERATIONS }, (_, i) => i),
        `limit=${limit}: dispatched set must be the exact prefix`
      );
    }
  });

  test("an undispatched remainder is reported for resume, not lost", async () => {
    const skipped: number[] = [];
    await runWithConcurrency(
      Array.from({ length: 200 }, (_, i) => i),
      3,
      async () => {},
      {
        shouldDispatch: (nextIndex) => nextIndex < CHECKPOINT_AFTER_GENERATIONS,
        onSkipped: (index) => skipped.push(index),
      }
    );
    assert.equal(skipped.length, 100);
    assert.equal(skipped[0], CHECKPOINT_AFTER_GENERATIONS);
    assert.equal(skipped[skipped.length - 1], 199);
  });

  test("a run that fits under the boundary is not flagged as aborted", async () => {
    const outcome = await runWithConcurrency(
      Array.from({ length: 8 }, (_, i) => i),
      3,
      async () => {},
      { shouldDispatch: (nextIndex) => nextIndex < CHECKPOINT_AFTER_GENERATIONS }
    );
    assert.equal(outcome.completed, 8);
    assert.equal(outcome.aborted, false);
  });

  test("a single-model selection still produces whole pairs", () => {
    const jobs = buildBatchJobs(tasks, allIds, "both", [MODELS[0]]);
    assert.equal(jobs.length, 100);
    assert.ok(jobs.every((j) => j.model === MODELS[0]));
    assert.equal(jobs[0].condition, "baseline");
    assert.equal(jobs[1].condition, "craft");
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
    retry_count: 0,
    retry_log: [],
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
    retry_count: 0,
    retry_log: [],
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
        "retry_count",
        "retry_log",
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
        "retry_count",
        "retry_log",
        "evaluator_justification",
      ]
    );
  });

  test("K1 — evaluations export is 13 columns", () => {
    assert.equal(EVALUATIONS_COLUMNS.length, 13);
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
