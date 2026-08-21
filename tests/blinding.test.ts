import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { buildEvaluatorPrompt } from "../lib/evaluator.ts";
import { isFamilyCollision, JUDGE_ROTATION, TEST_MODELS } from "../lib/models/registry.ts";

const REPO = process.cwd();

function read(rel: string): string {
  return readFileSync(path.join(REPO, rel), "utf-8");
}

/**
 * The blinding map is the one file that must never be reachable from a module
 * that builds or sends a judge payload.
 */
describe("5d — blinding map import boundary", () => {
  const FORBIDDEN_IMPORTERS = [
    "lib/evaluator.ts",
    "lib/models/claude.ts",
    "lib/models/openai.ts",
    "lib/models/gemini.ts",
  ];

  for (const file of FORBIDDEN_IMPORTERS) {
    test(`${file} does not import lib/blinding`, () => {
      const source = read(file);
      assert.ok(
        !/from\s+["'][^"']*\/blinding["']/.test(source) &&
          !/require\(["'][^"']*\/blinding["']\)/.test(source),
        `${file} imports the blinding map. Producer facts must not be reachable ` +
          `from an evaluator code path.`
      );
    });
  }

  test("only the sanctioned modules import lib/blinding", () => {
    const ALLOWED = new Set(["lib/blindingGuard.ts", "app/api/run/route.ts"]);
    const offenders: string[] = [];

    function walk(dir: string): void {
      for (const entry of readdirSync(path.join(REPO, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
          walk(rel);
        } else if (/\.tsx?$/.test(entry.name)) {
          if (rel === "lib/blinding.ts") continue;
          const source = read(rel);
          const imports =
            /from\s+["'][^"']*\/blinding["']/.test(source) ||
            /from\s+["']\.\/blinding["']/.test(source);
          if (imports && !ALLOWED.has(rel)) offenders.push(rel);
        }
      }
    }

    walk("lib");
    walk("app");
    walk("components");

    assert.deepEqual(
      offenders,
      [],
      `Unexpected importers of the blinding map: ${offenders.join(", ")}`
    );
  });
});

describe("5d — evaluator payload contains no producer facts", () => {
  const prompt = buildEvaluatorPrompt({
    task_description: "Fix the off-by-one error in the loop.",
    expected_constraints: ["Identify the line", "Explain the cause"],
    rubric_notes: "Award full marks only for a runnable fix.",
    model_response: "The loop bound should be < not <=.",
  });

  test("no model name appears in the judge prompt", () => {
    for (const model of ["claude-sonnet-5", "gpt-5.5-2026-04-23", "gemini-3.7-flash"]) {
      assert.ok(!prompt.includes(model), `judge prompt leaked model name ${model}`);
    }
  });

  test("no prompt condition appears in the judge prompt", () => {
    assert.ok(!/\bbaseline\b/i.test(prompt), "judge prompt leaked the baseline condition");
    assert.ok(!/\bcraft\b/i.test(prompt), "judge prompt leaked the CRAFT condition");
  });

  test("no blinding token appears in the judge prompt", () => {
    assert.ok(!/OUT-\d{4}/.test(prompt), "judge prompt leaked a blinding token");
  });

  test("buildEvaluatorPrompt accepts no producer parameters", () => {
    const source = read("lib/evaluator.ts");
    for (const forbidden of ["model_name", "prompt_condition", "anonymized_output_id"]) {
      assert.ok(
        !source.includes(forbidden),
        `lib/evaluator.ts references ${forbidden} — it must not know producer facts`
      );
    }
  });
});

describe("5e — judge family collision", () => {
  test("same family is always a collision", () => {
    assert.equal(isFamilyCollision("claude-sonnet-5", "claude-sonnet-5"), true);
    assert.equal(isFamilyCollision("gpt-5.5-2026-04-23", "gpt-5.5-2026-04-23"), true);
  });

  test("cross family is allowed", () => {
    assert.equal(isFamilyCollision("claude-sonnet-5", "gemini-3.7-flash"), false);
    assert.equal(isFamilyCollision("gpt-5.5-2026-04-23", "claude-sonnet-5"), false);
  });

  test("unknown models fail closed", () => {
    assert.equal(isFamilyCollision("who-knows", "gemini-3.7-flash"), true);
    assert.equal(isFamilyCollision("claude-sonnet-5", "who-knows"), true);
  });

  test("every rotation pairing is cross-family", () => {
    for (const testModel of TEST_MODELS) {
      const rotation = JUDGE_ROTATION[testModel];
      assert.equal(
        isFamilyCollision(testModel, rotation.primary),
        false,
        `${testModel} primary judge shares its family`
      );
      assert.equal(
        isFamilyCollision(testModel, rotation.secondary),
        false,
        `${testModel} secondary judge shares its family`
      );
    }
  });
});
