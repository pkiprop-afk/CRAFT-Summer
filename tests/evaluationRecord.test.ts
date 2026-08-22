import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildEvaluationRecord } from "../lib/evaluationRecord.ts";
import { EVALUATIONS_COLUMNS } from "../lib/exportShape.ts";

const response = {
  constraint_adherence: 3,
  logical_accuracy: 4,
  completeness: 2,
  total: 9,
  justification: "solid work",
  evaluator_provenance_fingerprint: "fp-x",
  evaluator_retry_count: 2,
  evaluator_retry_log: [
    { attempt: 1, reason: "503", http_status: 503, delay_ms: 2000 },
    { attempt: 2, reason: "503", http_status: 503, delay_ms: 4000 },
  ],
};

describe("G2 — deferred evaluation is structurally identical to inline", () => {
  test("the record carries exactly the 13-column contract, nothing else", () => {
    const record = buildEvaluationRecord({
      result_id: "RES-1",
      evaluator_model: "gemini-3.7-flash",
      is_primary: true,
      response,
    });
    // Key set must equal EVALUATIONS_COLUMNS exactly: no missing field, no
    // extra field that would make one path's records distinguishable.
    assert.deepEqual(
      Object.keys(record).sort(),
      [...EVALUATIONS_COLUMNS].sort()
    );
  });

  test("both paths flow through this ONE constructor — no second assembly site", () => {
    // The guarantee is structural: if either path hand-built its record, a
    // field drift between them would be silent. Assert neither the batch page
    // nor evaluate-pending constructs an evaluation object literal any more.
    const repo = process.cwd();
    const batch = readFileSync(path.join(repo, "app", "batch", "page.tsx"), "utf-8");
    const pending = readFileSync(path.join(repo, "scripts", "evaluatePending.ts"), "utf-8");
    for (const [name, src] of [
      ["app/batch/page.tsx", batch],
      ["scripts/evaluatePending.ts", pending],
    ] as const) {
      assert.ok(
        src.includes("buildEvaluationRecord("),
        `${name} must assemble records via buildEvaluationRecord`
      );
      assert.ok(
        !src.includes("evaluation_id:"),
        `${name} must not hand-assemble an EvaluationRecord literal`
      );
    }
  });

  test("identical inputs produce identical records apart from id and timestamp", () => {
    const args = {
      result_id: "RES-9",
      evaluator_model: "claude-sonnet-5",
      is_primary: false,
      response,
      evaluated_at: "2026-08-22T14:30:00.000Z",
    };
    const inline = buildEvaluationRecord(args);
    const deferred = buildEvaluationRecord(args);
    const strip = (r: typeof inline) => {
      const { evaluation_id, ...rest } = r;
      void evaluation_id;
      return rest;
    };
    assert.deepEqual(strip(inline), strip(deferred));
    assert.notEqual(inline.evaluation_id, deferred.evaluation_id, "ids remain unique");
    assert.match(inline.evaluation_id, /^EVAL-[0-9a-f-]{36}$/);
    assert.match(deferred.evaluation_id, /^EVAL-[0-9a-f-]{36}$/, "same id format both paths");
  });

  test("retry metadata defaults are shared, not per-path", () => {
    const record = buildEvaluationRecord({
      result_id: "RES-2",
      evaluator_model: "gpt-5.5-2026-04-23",
      is_primary: false,
      response: { ...response, evaluator_retry_count: undefined, evaluator_retry_log: undefined },
    });
    assert.equal(record.retry_count, 0);
    assert.deepEqual(record.retry_log, []);
  });
});
