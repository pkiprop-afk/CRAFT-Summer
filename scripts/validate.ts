/**
 * M6 — Parity validation.
 *
 * A stop-work gate: a non-zero exit means the study is not in a runnable or
 * analysable state. Run before any model run, and again before analysis.
 *
 * Provider checks use model-LIST endpoints only — zero tokens, no generation.
 *
 * Run: npm run validate
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { assembleCraftPrompt } from "../lib/craft.ts";
import { computeTaskVersion } from "../lib/taskVersion.ts";
import { computeRunSettingsHash } from "../lib/runSettings.ts";
import {
  checkConfiguredModels,
  listAnthropicModels,
  listGoogleModels,
  listOpenAIModels,
  provenanceFingerprint,
  type ProviderListing,
} from "../lib/models/availability.ts";
import { detectDrift, type ManifestEntry, type ModelManifest } from "../lib/models/manifest.ts";
import {
  GOOGLE_MODEL_ID,
  isFamilyCollision,
  MODEL_FAMILY,
  TEST_MODELS,
  type ModelFamily,
} from "../lib/models/registry.ts";
import type { EvaluationRecord, ResultRecord, TaskRecord } from "../types/index.ts";

const REPO = process.cwd();
const CONDITIONS = ["baseline", "craft"] as const;

const EXPECTED_TASKS = 50;
const STABILITY_RUNS_PER_CELL = 3;

const HEDGES = [
  "ideally",
  "if possible",
  "preferably",
  "where appropriate",
  "as appropriate",
  "where relevant",
  "if applicable",
  "optionally",
];

const errors: string[] = [];
const warnings: string[] = [];

const err = (msg: string) => errors.push(msg);
const warn = (msg: string) => warnings.push(msg);

function readJson<T>(rel: string, fallback: T): T {
  const p = path.join(REPO, rel);
  if (!existsSync(p)) return fallback;
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  const p = path.join(REPO, ".env.local");
  if (!existsSync(p)) return out;
  for (const raw of readFileSync(p, "utf-8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

async function main(): Promise<void> {
  const tasks = readJson<TaskRecord[]>("data/tasks.json", []);
  const results = readJson<ResultRecord[]>("data/results.json", []);
  const evaluations = readJson<EvaluationRecord[]>("data/evaluations.json", []);
  const subset = readJson<{ task_ids: string[] } | null>("data/stability_subset.json", null);

  // ---------------------------------------------------------------- REGISTRY
  if (tasks.length !== EXPECTED_TASKS) {
    err(`registry holds ${tasks.length} tasks, expected ${EXPECTED_TASKS}`);
  }

  const ids = tasks.map((t) => t.task_id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) err(`duplicate task_ids: ${[...new Set(dupes)].join(", ")}`);

  const expectedIds = Array.from(
    { length: EXPECTED_TASKS },
    (_, i) => `T${String(i + 1).padStart(3, "0")}`
  );
  const missing = expectedIds.filter((id) => !ids.includes(id));
  if (missing.length > 0) err(`task_ids missing from the registry: ${missing.join(", ")}`);

  const VALID_DOMAINS = [
    "coding",
    "data_analysis",
    "finance",
    "policy",
    "education",
    "communication",
  ];

  for (const task of tasks) {
    if (!task.baseline_prompt?.trim()) err(`${task.task_id}: baseline_prompt is empty`);

    for (const field of [
      "craft_context",
      "craft_role",
      "craft_actions",
      "craft_format",
      "craft_tone",
    ] as const) {
      if (!task[field]?.trim()) err(`${task.task_id}: ${field} is empty`);
    }

    const expected = assembleCraftPrompt(task);
    if (task.craft_prompt !== expected) {
      err(`${task.task_id}: craft_prompt is not byte-identical to assembleCraftPrompt() output`);
    }

    if (!Array.isArray(task.expected_constraints) || task.expected_constraints.length === 0) {
      err(`${task.task_id}: expected_constraints is empty`);
    } else {
      task.expected_constraints.forEach((c, i) => {
        for (const hedge of HEDGES) {
          if (c.toLowerCase().includes(hedge)) {
            err(`${task.task_id}: expected_constraints[${i + 1}] contains hedge "${hedge}"`);
          }
        }
      });
    }

    if (!VALID_DOMAINS.includes(task.domain)) {
      err(`${task.task_id}: domain "${task.domain}" is not in the enum`);
    }

    const currentVersion = await computeTaskVersion(task);
    if (task.task_version !== currentVersion) {
      err(`${task.task_id}: stored task_version does not match its content`);
    }
  }

  // -------------------------------------------------------------------- RUNS
  const taskById = new Map(tasks.map((t) => [t.task_id, t]));
  const mainResults = results.filter((r) => r.run_type === "main");
  const stabilityResults = results.filter((r) => r.run_type === "stability");

  for (const r of results) {
    if (r.run_type !== "main" && r.run_type !== "stability") {
      err(`${r.result_id}: invalid run_type "${r.run_type}"`);
    }
    const task = taskById.get(r.task_id);
    if (!task) {
      err(`${r.result_id}: references unknown task ${r.task_id}`);
      continue;
    }
    if (r.task_version !== task.task_version) {
      err(
        `${r.result_id} (${r.task_id}): STALE — recorded against task_version ` +
          `${r.task_version}, task is now ${task.task_version}`
      );
    }
    // I5 — an empty output must never be stored as a run: judges would score it
    // as a maximally non-compliant answer, turning a provider glitch into a
    // real-looking zero.
    if (!r.raw_model_output || r.raw_model_output.trim().length === 0) {
      err(
        `${r.result_id} (${r.task_id} / ${r.model_name} / ${r.prompt_condition}): ` +
          `raw_model_output is EMPTY`
      );
    }
    if (r.retry_count > 0) {
      warn(
        `${r.result_id} (${r.task_id}): succeeded after ${r.retry_count} retry/retries — ` +
          `the provider was degraded at run time`
      );
    }
    if (r.truncated) {
      warn(
        `${r.result_id} (${r.task_id} / ${r.model_name} / ${r.prompt_condition}): ` +
          `output was TRUNCATED at max_tokens=${r.max_tokens}`
      );
    }
  }

  // Main: exactly one per cell, run_number == 1
  for (const task of tasks) {
    for (const model of TEST_MODELS) {
      for (const condition of CONDITIONS) {
        const cell = mainResults.filter(
          (r) =>
            r.task_id === task.task_id &&
            r.model_name === model &&
            r.prompt_condition === condition
        );
        if (cell.length > 1) {
          err(
            `main cell ${task.task_id}/${model}/${condition} has ${cell.length} results, ` +
              `expected exactly 1 (n=1)`
          );
        }
        for (const r of cell) {
          if (r.run_number !== 1) {
            err(
              `${r.result_id}: main run_number is ${r.run_number}, must be 1 (n=1 design)`
            );
          }
        }
      }
    }
  }

  // Stability: exactly three per cell, {1,2,3}, subset tasks only
  const subsetIds = subset?.task_ids ?? [];
  if (!subset) {
    err("data/stability_subset.json not found — the stability subset is not frozen");
  }

  for (const r of stabilityResults) {
    if (!subsetIds.includes(r.task_id)) {
      err(
        `${r.result_id}: stability result for ${r.task_id}, which is NOT in the frozen subset`
      );
    }
  }

  for (const taskId of subsetIds) {
    for (const model of TEST_MODELS) {
      for (const condition of CONDITIONS) {
        const cell = stabilityResults.filter(
          (r) =>
            r.task_id === taskId && r.model_name === model && r.prompt_condition === condition
        );
        if (cell.length === 0) continue; // not yet run — completion, not an error
        if (cell.length !== STABILITY_RUNS_PER_CELL) {
          err(
            `stability cell ${taskId}/${model}/${condition} has ${cell.length} results, ` +
              `expected exactly ${STABILITY_RUNS_PER_CELL}`
          );
        }
        const numbers = [...cell.map((r) => r.run_number)].sort((a, b) => a - b);
        const expectedSet = [1, 2, 3];
        if (
          cell.length === STABILITY_RUNS_PER_CELL &&
          JSON.stringify(numbers) !== JSON.stringify(expectedSet)
        ) {
          err(
            `stability cell ${taskId}/${model}/${condition} run_numbers are ` +
              `{${numbers.join(",")}}, expected {1,2,3}`
          );
        }
      }
    }
  }

  // run_settings_hash must match the counterpart condition, within run_type
  const settingsGroups = new Map<string, ResultRecord[]>();
  for (const r of results) {
    const key = `${r.task_id}::${r.model_name}::${r.run_type}`;
    settingsGroups.set(key, [...(settingsGroups.get(key) ?? []), r]);
  }
  for (const [key, group] of settingsGroups) {
    const hashes = new Set(group.map((r) => r.run_settings_hash));
    if (hashes.size > 1) {
      err(
        `run_settings_hash mismatch within ${key}: ${[...hashes].join(", ")} — ` +
          `both conditions of a pair must share identical settings`
      );
    }
    // Re-derive to catch a hand-edited or stale stored hash. The reconstruction
    // must include the model's effort field, or it hashes a smaller field set
    // than the one recorded and reports a false mismatch.
    for (const r of group) {
      const d = r.decoding_params;
      const recomputed = await computeRunSettingsHash({
        temperature: d.temperature,
        max_tokens: r.max_tokens,
        system_prompt: r.system_prompt,
        ...(d.effort !== undefined ? { effort: d.effort } : {}),
        ...(d.reasoning_effort !== undefined
          ? { reasoning_effort: d.reasoning_effort }
          : {}),
      });
      if (recomputed.hash !== r.run_settings_hash) {
        err(
          `${r.result_id}: stored run_settings_hash does not match its own settings ` +
            `(stored fields ${JSON.stringify(r.run_settings_fields)}, ` +
            `recomputed ${JSON.stringify(recomputed.fields)})`
        );
      }
      // The recorded field set must match what those settings actually produce.
      if (JSON.stringify(recomputed.fields) !== JSON.stringify(r.run_settings_fields)) {
        err(
          `${r.result_id}: run_settings_fields ${JSON.stringify(r.run_settings_fields)} ` +
            `does not match the field set implied by decoding_params ` +
            `${JSON.stringify(recomputed.fields)}`
        );
      }
    }
  }

  // ------------------------------------------------------------- EVALUATIONS
  const resultById = new Map(results.map((r) => [r.result_id, r]));
  const evalsByResult = new Map<string, EvaluationRecord[]>();
  for (const e of evaluations) {
    if (!resultById.has(e.result_id)) {
      err(`${e.evaluation_id}: references unknown result_id ${e.result_id}`);
      continue;
    }
    evalsByResult.set(e.result_id, [...(evalsByResult.get(e.result_id) ?? []), e]);
  }

  for (const e of evaluations) {
    if (e.evaluator_model === "none") {
      err(
        `${e.evaluation_id}: evaluator_model is "none" — an unscored cell is INCOMPLETE ` +
          `and must not be recorded as an evaluation`
      );
    }
    if (e.is_primary && e.evaluator_model !== GOOGLE_MODEL_ID) {
      err(
        `${e.evaluation_id}: primary evaluator is ${e.evaluator_model}, must be ${GOOGLE_MODEL_ID}`
      );
    }
    // K2 — same treatment as result retries: a warning, not an error. The
    // judgement is valid; the fact worth surfacing is that the instrument was
    // degraded when it was made. Labelled by role because retries on the
    // PRIMARY judge bear on every score in the study.
    if (e.retry_count > 0) {
      warn(
        `${e.evaluation_id} (result ${e.result_id}, ${e.is_primary ? "PRIMARY" : "secondary"} ` +
          `judge ${e.evaluator_model}): scored after ${e.retry_count} retry/retries — ` +
          `the judge provider was degraded at evaluation time`
      );
    }
    const parent = resultById.get(e.result_id);
    if (parent && isFamilyCollision(parent.model_name, e.evaluator_model)) {
      err(
        `${e.evaluation_id}: judge ${e.evaluator_model} shares a family with the producing ` +
          `model ${parent.model_name} on result ${e.result_id}`
      );
    }
  }

  // A truncated judge call is an ERROR, not a warning: it is a defect in our
  // own configuration, it is deterministic, and it correlates with task
  // difficulty — so it removes data selectively rather than at random, which
  // biases inter-rater reliability instead of merely shrinking the sample.
  const attempts = readJson<Array<{ outcome?: string; evaluator_model?: string }>>(
    "data/eval_attempts.json",
    []
  );
  const truncatedJudge = attempts.filter((a) => a.outcome === "judge_truncated");
  if (truncatedJudge.length > 0) {
    const byJudge = new Map<string, number>();
    for (const a of truncatedJudge) {
      const k = a.evaluator_model ?? "(unknown)";
      byJudge.set(k, (byJudge.get(k) ?? 0) + 1);
    }
    for (const [judge, count] of byJudge) {
      err(
        `${judge}: ${count} evaluation(s) truncated at the judge token limit before ` +
          `producing a score. This is a configuration defect, not provider flakiness — ` +
          `raise the evaluator output budget and re-run those cells.`
      );
    }
  }

  for (const r of results) {
    const evals = evalsByResult.get(r.result_id) ?? [];
    const primaries = evals.filter((e) => e.is_primary).length;
    const secondaries = evals.filter((e) => !e.is_primary).length;

    if (evals.length === 0) continue; // unevaluated — completion, not an error

    if (evals.length !== 2 || primaries !== 1 || secondaries !== 1) {
      err(
        `${r.result_id}: has ${evals.length} evaluation(s) (${primaries} primary, ` +
          `${secondaries} secondary), expected exactly 1 primary and 1 secondary`
      );
    }
  }

  // ------------------------------------------------------------------ MODELS
  const env = { ...readEnvFile(), ...process.env };
  const ENV_VAR: Record<ModelFamily, string> = {
    anthropic: "ANTHROPIC_API_KEY",
    openai: "OPENAI_API_KEY",
    google: "GOOGLE_GENERATIVE_AI_API_KEY",
  };
  const keyFor = (f: ModelFamily) => (env[ENV_VAR[f]] ?? "").trim();

  async function listFor(family: ModelFamily): Promise<ProviderListing> {
    if (!keyFor(family)) {
      return {
        family,
        reachable: false,
        httpStatus: null,
        models: [],
        entries: [],
        error: `${ENV_VAR[family]} is missing or blank`,
      };
    }
    if (family === "anthropic") return listAnthropicModels(keyFor("anthropic"));
    if (family === "openai") return listOpenAIModels(keyFor("openai"));
    return listGoogleModels(keyFor("google"));
  }

  const listings = await Promise.all([
    listFor("anthropic"),
    listFor("openai"),
    listFor("google"),
  ]);

  for (const l of listings) {
    if (!l.reachable) err(`provider ${l.family} unreachable: ${l.error}`);
  }

  const { missing: missingModels } = checkConfiguredModels(listings, MODEL_FAMILY);
  for (const m of missingModels) {
    err(`configured model ${m.model_id} (${m.family}) is not offered by its provider`);
  }

  const manifestDir = path.join(REPO, "data", "model_manifests");
  const manifestFiles = existsSync(manifestDir)
    ? readdirSync(manifestDir).filter((f) => f.endsWith(".json")).sort()
    : [];

  if (manifestFiles.length === 0) {
    err("no model manifest captured — run `npm run capture-model-manifest`");
  } else if (listings.every((l) => l.reachable)) {
    const previous: ModelManifest = JSON.parse(
      readFileSync(path.join(manifestDir, manifestFiles[manifestFiles.length - 1]), "utf-8")
    );
    const configuredIds = new Set(Object.keys(MODEL_FAMILY));
    const currentEntries: ManifestEntry[] = [];
    for (const l of listings) {
      for (const e of l.entries) {
        currentEntries.push({
          model_id: e.id,
          family: l.family,
          created_at: e.created_at,
          display_name: e.display_name,
          version: e.version,
          description: e.description,
          shutdown_date: e.shutdown_date,
          provenance_fingerprint: provenanceFingerprint(e),
          configured: configuredIds.has(e.id),
        });
      }
      for (const e of l.entries) {
        if (configuredIds.has(e.id) && e.shutdown_date) {
          warn(`${e.id} has a scheduled shutdown_date of ${e.shutdown_date}`);
        }
      }
    }
    const drift = detectDrift(
      previous,
      { captured_at: new Date().toISOString(), entries: currentEntries, providers: [] },
      Object.keys(MODEL_FAMILY)
    );
    for (const d of drift) {
      err(
        `provenance DRIFT on ${d.model_id} (${d.reason}): was ` +
          `${d.previous_fingerprint ?? "(absent)"}, now ${d.current_fingerprint ?? "(absent)"}`
      );
    }
  }

  // ------------------------------------------------------------------ REPORT
  const mainExpectedGen = EXPECTED_TASKS * CONDITIONS.length * TEST_MODELS.length;
  const mainExpectedEval = mainExpectedGen * 2;
  const stabilityExpectedGen =
    subsetIds.length * CONDITIONS.length * TEST_MODELS.length * STABILITY_RUNS_PER_CELL;
  const stabilityExpectedEval = stabilityExpectedGen * 2;

  const mainResultIds = new Set(mainResults.map((r) => r.result_id));
  const stabilityResultIds = new Set(stabilityResults.map((r) => r.result_id));
  const mainEvalCount = evaluations.filter((e) => mainResultIds.has(e.result_id)).length;
  const stabilityEvalCount = evaluations.filter((e) =>
    stabilityResultIds.has(e.result_id)
  ).length;

  const bar = "=".repeat(78);
  console.log(bar);
  console.log("M6 — PARITY VALIDATION");
  console.log(bar);

  console.log("\nCOMPLETION");
  console.log(
    `  main       generations ${String(mainResults.length).padStart(3)}/${mainExpectedGen}` +
      `   evaluations ${String(mainEvalCount).padStart(3)}/${mainExpectedEval}`
  );
  console.log(
    `  stability  generations ${String(stabilityResults.length).padStart(3)}/${stabilityExpectedGen}` +
      `   evaluations ${String(stabilityEvalCount).padStart(3)}/${stabilityExpectedEval}`
  );
  console.log(
    "  (stability runs never count toward main-study completion — reported separately)"
  );

  console.log(`\nERRORS   ${errors.length}`);
  if (errors.length === 0) {
    console.log("  (none)");
  } else {
    errors.forEach((e, i) => console.log(`  ${String(i + 1).padStart(3)}. ${e}`));
  }

  console.log(`\nWARNINGS ${warnings.length}`);
  if (warnings.length === 0) {
    console.log("  (none)");
  } else {
    warnings.forEach((w, i) => console.log(`  ${String(i + 1).padStart(3)}. ${w}`));
  }

  console.log("\n" + bar);
  if (errors.length > 0) {
    console.log(`FAILED — ${errors.length} error(s). This is a stop-work condition.`);
    process.exitCode = 1;
  } else {
    console.log("PASSED — no errors. Warnings, if any, are advisory.");
  }
  console.log(bar);
}

main();
