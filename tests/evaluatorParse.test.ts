import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseEvaluatorResponse } from "../lib/evaluator.ts";
import { markExistingCells, buildBatchJobs } from "../lib/batch.ts";

describe("evaluator parsing — scores survive a missing justification", () => {
  // Verbatim from the run this halted: claude-sonnet-5 as secondary judge
  // returned a complete score set and omitted the Justification line.
  const REAL_OMISSION =
    "Constraint adherence: 4/4\nLogical accuracy: 4/4\nCompleteness: 2/2\nTotal: 10/10";

  test("the recorded omission now parses instead of being discarded", () => {
    const p = parseEvaluatorResponse(REAL_OMISSION);
    assert.ok(p, "a valid score set must not be thrown away over missing prose");
    assert.equal(p.constraint_adherence, 4);
    assert.equal(p.logical_accuracy, 4);
    assert.equal(p.completeness, 2);
    assert.equal(p.total, 10);
    assert.equal(p.justification, "");
    assert.equal(p.justification_missing, true);
  });

  test("a well-formed response is unaffected and not flagged", () => {
    const p = parseEvaluatorResponse(
      "Constraint adherence: 3/4\nLogical accuracy: 4/4\nCompleteness: 1/2\nTotal: 8/10\n" +
        "Justification: Mostly correct but missed one constraint."
    );
    assert.ok(p);
    assert.equal(p.total, 8);
    assert.equal(p.justification, "Mostly correct but missed one constraint.");
    assert.equal(p.justification_missing, false);
  });

  test("an empty justification counts as missing", () => {
    const p = parseEvaluatorResponse(
      "Constraint adherence: 4/4\nLogical accuracy: 4/4\nCompleteness: 2/2\nTotal: 10/10\nJustification:   "
    );
    assert.ok(p);
    assert.equal(p.justification_missing, true);
  });

  test("a MISSING SCORE is still unparseable — there is no measurement to keep", () => {
    assert.equal(
      parseEvaluatorResponse("Constraint adherence: 4/4\nLogical accuracy: 4/4\nTotal: 10/10"),
      null,
      "completeness absent"
    );
    assert.equal(
      parseEvaluatorResponse("Justification: it was good"),
      null,
      "no scores at all"
    );
    assert.equal(parseEvaluatorResponse(""), null);
    assert.equal(parseEvaluatorResponse("I cannot evaluate this response."), null);
  });

  test("scores are read independently of the total the judge wrote", () => {
    // The parser must not silently repair an inconsistent total.
    const p = parseEvaluatorResponse(
      "Constraint adherence: 2/4\nLogical accuracy: 2/4\nCompleteness: 1/2\nTotal: 9/10\nJustification: x"
    );
    assert.ok(p);
    assert.equal(p.total, 9, "the judge's own total is recorded as given");
  });
});

describe("resume — cells already generated are not re-run", () => {
  const tasks = [
    { task_id: "T001", domain: "coding", task_description: "d", baseline_prompt: "b", craft_prompt: "c" },
    { task_id: "T002", domain: "coding", task_description: "d", baseline_prompt: "b", craft_prompt: "c" },
  ] as unknown as Parameters<typeof buildBatchJobs>[0];
  const MODELS = ["claude-sonnet-5", "gpt-5.5-2026-04-23"] as const;
  const jobs = buildBatchJobs(tasks, new Set(["T001", "T002"]), "both", MODELS);

  test("all eight cells are pending with no history", () => {
    const marked = markExistingCells(jobs, [], "main");
    assert.equal(marked.filter((j) => j.status === "pending").length, 8);
  });

  test("an existing cell is skipped, not re-dispatched", () => {
    const existing = [
      { task_id: "T001", model_name: "claude-sonnet-5", prompt_condition: "baseline" as const, run_type: "main" as const },
    ];
    const marked = markExistingCells(jobs, existing, "main");
    assert.equal(marked.filter((j) => j.status === "skipped_existing").length, 1);
    assert.equal(marked.filter((j) => j.status === "pending").length, 7);
    const skipped = marked.find((j) => j.status === "skipped_existing")!;
    assert.equal(skipped.task_id, "T001");
    assert.equal(skipped.model, "claude-sonnet-5");
    assert.equal(skipped.condition, "baseline");
  });

  test("the same task under the OTHER model is still outstanding", () => {
    const existing = [
      { task_id: "T001", model_name: "claude-sonnet-5", prompt_condition: "baseline" as const, run_type: "main" as const },
    ];
    const marked = markExistingCells(jobs, existing, "main");
    const other = marked.find(
      (j) => j.task_id === "T001" && j.model === "gpt-5.5-2026-04-23" && j.condition === "baseline"
    )!;
    assert.equal(other.status, "pending", "cells are per model, not per task");
  });

  test("a stability result does not mask a main cell", () => {
    const existing = [
      { task_id: "T001", model_name: "claude-sonnet-5", prompt_condition: "baseline" as const, run_type: "stability" as const },
    ];
    const marked = markExistingCells(jobs, existing, "main");
    assert.equal(marked.filter((j) => j.status === "skipped_existing").length, 0);
  });
});
