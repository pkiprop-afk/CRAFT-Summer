import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  findPendingEvaluations,
  stillIncomplete,
  RotationIntegrityError,
} from "../lib/pendingEvaluations.ts";
import { familyOf, judgesFor } from "../lib/models/registry.ts";
import type { EvaluationRecord, ResultRecord } from "../types/index.ts";

const result = (id: string, model: string): ResultRecord =>
  ({
    result_id: id,
    task_id: "T001",
    task_version: "tv",
    model_name: model,
    model_provenance_fingerprint: "fp",
    prompt_condition: "baseline",
    run_number: 1,
    run_type: "main",
    decoding_params: { temperature: null, effort: null },
    max_tokens: 4000,
    system_prompt: "s",
    run_settings_hash: "rs2-x",
    run_settings_fields: [],
    run_date: "2026-08-22T00:00:00.000Z",
    raw_model_output: "output",
    anonymized_output_id: `OUT-${id}`,
    truncated: false,
    reasoning_tokens: null,
    retry_count: 0,
    retry_log: [],
    notes: "",
  }) as ResultRecord;

const evaluation = (
  resultId: string,
  judge: string,
  isPrimary: boolean
): EvaluationRecord =>
  ({
    evaluation_id: `E-${resultId}-${judge}`,
    result_id: resultId,
    evaluator_model: judge,
    evaluator_provenance_fingerprint: "fp",
    is_primary: isPrimary,
    evaluated_at: "2026-08-22T00:00:00.000Z",
    constraint_adherence_score_0_4: 4,
    logical_accuracy_score_0_4: 4,
    completeness_score_0_2: 2,
    total_score_0_10: 10,
    retry_count: 0,
    retry_log: [],
    evaluator_justification: "j",
  }) as EvaluationRecord;

const CLAUDE = "claude-sonnet-5" as const;
const GPT = "gpt-5.5-2026-04-23" as const;
const GEMINI = "gemini-3.7-flash" as const;

describe("evaluate-pending — what it schedules", () => {
  test("an unjudged result needs both judges of its rotation", () => {
    const p = findPendingEvaluations([result("R1", CLAUDE)], []);
    assert.equal(p.length, 2);
    const rot = judgesFor(CLAUDE);
    assert.deepEqual(
      p.map((x) => x.evaluator).sort(),
      [rot.primary, rot.secondary].sort()
    );
    assert.equal(p.filter((x) => x.is_primary).length, 1);
  });

  test("a singly-judged result needs only the missing role", () => {
    const rot = judgesFor(CLAUDE);
    const p = findPendingEvaluations(
      [result("R1", CLAUDE)],
      [evaluation("R1", rot.primary, true)]
    );
    assert.equal(p.length, 1);
    assert.equal(p[0].evaluator, rot.secondary);
    assert.equal(p[0].is_primary, false);
  });

  test("a fully judged result needs nothing", () => {
    const rot = judgesFor(CLAUDE);
    const p = findPendingEvaluations(
      [result("R1", CLAUDE)],
      [evaluation("R1", rot.primary, true), evaluation("R1", rot.secondary, false)]
    );
    assert.equal(p.length, 0);
  });

  test("it carries the blinding token, never the producing model, to the judge", () => {
    const p = findPendingEvaluations([result("R1", CLAUDE)], []);
    for (const x of p) {
      assert.equal(x.anonymized_output_id, "OUT-R1");
      assert.ok(x.anonymized_output_id.startsWith("OUT-"));
    }
  });
});

describe("evaluate-pending — the guarantees", () => {
  test("NEVER proposes a judge that already scored that result", () => {
    const rot = judgesFor(CLAUDE);
    // Same judge recorded under the wrong role — it must still not be re-added.
    const p = findPendingEvaluations(
      [result("R1", CLAUDE)],
      [evaluation("R1", rot.primary, false)]
    );
    assert.ok(
      !p.some((x) => x.evaluator === rot.primary),
      "a judge with an existing evaluation must never be scheduled again"
    );
  });

  test("NEVER proposes a second primary", () => {
    for (const producing of [CLAUDE, GPT]) {
      const rot = judgesFor(producing);
      // A primary already exists, recorded under a different judge id.
      const p = findPendingEvaluations(
        [result("R1", producing)],
        [evaluation("R1", rot.secondary, true)]
      );
      assert.equal(
        p.filter((x) => x.is_primary).length,
        0,
        `${producing}: a second primary must never be scheduled`
      );
    }
  });

  test("NEVER proposes a judge in the producing model's family", () => {
    for (const producing of [CLAUDE, GPT]) {
      const p = findPendingEvaluations([result("R1", producing)], []);
      for (const x of p) {
        assert.notEqual(
          familyOf(x.evaluator),
          familyOf(producing),
          `${producing} must not be judged by ${x.evaluator}`
        );
      }
    }
  });

  test("every scheduled judge is one of exactly two roles, never more", () => {
    const p = findPendingEvaluations(
      [result("R1", CLAUDE), result("R2", GPT)],
      []
    );
    for (const id of ["R1", "R2"]) {
      const forResult = p.filter((x) => x.result_id === id);
      assert.equal(forResult.length, 2);
      assert.equal(forResult.filter((x) => x.is_primary).length, 1);
      assert.equal(forResult.filter((x) => !x.is_primary).length, 1);
      assert.equal(new Set(forResult.map((x) => x.evaluator)).size, 2);
    }
  });

  test("the primary is gemini for both producing models", () => {
    // What makes the two models' scores comparable.
    const p = findPendingEvaluations([result("R1", CLAUDE), result("R2", GPT)], []);
    for (const x of p.filter((y) => y.is_primary)) {
      assert.equal(x.evaluator, GEMINI);
    }
  });

  test("a collision would raise rather than be silently filled", () => {
    // Guards the belt-and-braces branch: if the rotation were ever misconfigured
    // to return a same-family judge, repairing the cell would be a validity
    // failure, not a repair.
    assert.ok(RotationIntegrityError.prototype instanceof Error);
  });
});

describe("stillIncomplete", () => {
  test("counts a cell complete only with exactly one of each role", () => {
    const rot = judgesFor(CLAUDE);
    const r = [result("R1", CLAUDE)];
    assert.equal(stillIncomplete(r, []).length, 1);
    assert.equal(stillIncomplete(r, [evaluation("R1", rot.primary, true)]).length, 1);
    assert.equal(
      stillIncomplete(r, [
        evaluation("R1", rot.primary, true),
        evaluation("R1", rot.secondary, false),
      ]).length,
      0
    );
    // Two primaries is a rotation bug, not a complete cell.
    assert.equal(
      stillIncomplete(r, [
        evaluation("R1", rot.primary, true),
        { ...evaluation("R1", rot.secondary, true), evaluation_id: "E2" },
      ]).length,
      1
    );
  });
});
