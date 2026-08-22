import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  REQUIRED_CONSTRAINT_COUNT,
  splitConstraints,
  strayMarkerPositions,
  validateTaskRows,
  type TaskImportRow,
} from "../lib/taskImport.ts";

const FIVE = `(1) First rule. (2) Second rule. (3) Third rule. (4) Fourth rule. (5) Fifth rule.`;

/** A fully-valid import row; override fields per test. */
const row = (over: Partial<TaskImportRow> = {}): TaskImportRow => ({
  task_id: "T900",
  domain: "coding",
  source_or_origin: "test",
  task_title: "t",
  task_description: "d",
  task_input: "i",
  baseline_prompt: "b",
  craft_context: "c",
  craft_role: "r",
  craft_actions: "a",
  craft_format: "f",
  craft_tone: "t",
  expected_constraints: FIVE,
  rubric_notes: "n",
  difficulty_level: "Medium",
  requires_external_knowledge: "false",
  ...over,
});

describe("constraint count — exactly five, enforced at the boundary", () => {
  test("the contract is five", () => {
    assert.equal(REQUIRED_CONSTRAINT_COUNT, 5);
  });

  test("a clean five-constraint cell imports", () => {
    const result = validateTaskRows([row()]);
    assert.equal(result.importedCount, 1);
    assert.equal(result.tasks[0].expected_constraints.length, 5);
  });

  test("four constraints are rejected, not imported short", () => {
    const result = validateTaskRows([
      row({ expected_constraints: `(1) A. (2) B. (3) C. (4) D.` }),
    ]);
    assert.equal(result.importedCount, 0);
    assert.match(result.errors[0].reasons.join("; "), /split to 4 .* exactly 5 required/);
  });

  test("six constraints are rejected, not imported long", () => {
    const result = validateTaskRows([
      row({ expected_constraints: `${FIVE} (6) Sixth rule.` }),
    ]);
    assert.equal(result.importedCount, 0);
  });

  test("a JSON array is held to the same count", () => {
    const result = validateTaskRows([
      row({ expected_constraints: JSON.stringify(["a", "b", "c"]) }),
    ]);
    assert.equal(result.importedCount, 0);
    assert.match(result.errors[0].reasons.join("; "), /via json/);
  });

  test("an unsplit cell fails the count rule too", () => {
    const result = validateTaskRows([
      row({ expected_constraints: "one blob of text with no structure" }),
    ]);
    assert.equal(result.importedCount, 0);
  });
});

describe("stray parenthesized digits — the is_locked(5) case", () => {
  // Verbatim shape of the authored defect this rule exists for: constraint (4)
  // quoted `is_locked(5)`, so the numbered split keyed on it and produced SIX
  // constraints — one a sentence fragment — while passing every other check.
  const IS_LOCKED = `(1) States the defect. (2) States the others preserve behavior. (3) Must not request changes to correct hunks. (4) Demonstrates the defect: is_locked(5) returns True before and False after. (5) Final line is REQUEST_CHANGES.`;

  test("the literal authored defect is rejected with the stray named", () => {
    const result = validateTaskRows([row({ expected_constraints: IS_LOCKED })]);
    assert.equal(result.importedCount, 0, "would have imported as 6 constraints");
    const reason = result.errors[0].reasons.join("; ");
    assert.match(reason, /split to 6/);
    assert.match(reason, /corrupting the split/);
  });

  test("the split itself reports the marker digits", () => {
    const split = splitConstraints(IS_LOCKED);
    assert.equal(split.method, "numbered");
    assert.equal(split.values.length, 6);
    assert.deepEqual(split.markerDigits, [1, 2, 3, 4, 5, 5]);
  });

  test("stray detection: duplicates, gaps, out-of-order", () => {
    assert.deepEqual(strayMarkerPositions([1, 2, 3, 4, 5]), []);
    assert.deepEqual(strayMarkerPositions([1, 2, 3, 4, 5, 5]), [6]);
    assert.deepEqual(strayMarkerPositions([1, 2, 9, 3, 4, 5]), [3]);
    assert.deepEqual(strayMarkerPositions([2, 3, 4, 5, 6]), [1, 2, 3, 4, 5]);
  });

  test("a stray with a coincidentally-correct count is still rejected", () => {
    // Out-of-order digits with count 5: pieces are not the authored five.
    const result = validateTaskRows([
      row({
        expected_constraints: `(1) A. (2) B. (3) C. (5) D-fragment. (4) E.`,
      }),
    ]);
    assert.equal(result.importedCount, 0);
    assert.match(
      result.errors[0].reasons.join("; "),
      /parenthesized digit that is not a constraint marker/
    );
  });

  test("flagged in the constraint report, so the dry run surfaces it", () => {
    const result = validateTaskRows([row({ expected_constraints: IS_LOCKED })]);
    assert.equal(result.constraintReports[0].flagged, true);
  });

  test("a paren-digit inside a JSON-array value does not false-positive", () => {
    // JSON is authoritative; markers play no role in its split. Count rules
    // still apply, but "(5)" inside a value is not a stray there.
    const result = validateTaskRows([
      row({
        expected_constraints: JSON.stringify([
          "a",
          "b",
          "c",
          "demonstrates is_locked(5) flips",
          "e",
        ]),
      }),
    ]);
    assert.equal(result.importedCount, 1);
  });
});
