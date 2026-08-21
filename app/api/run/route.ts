import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callOpenAI } from "@/lib/models/openai";
import { getResults, getTask } from "@/lib/db";
import { MissingApiKeyError } from "@/lib/env";
import { allocateBlindingToken } from "@/lib/blinding";
import {
  MissingManifestError,
  provenanceFingerprintFor,
} from "@/lib/models/provenance";
import { computeRunSettingsHash, diffRunSettings } from "@/lib/runSettings";
import {
  isInStabilitySubset,
  loadStabilitySubset,
  MissingStabilitySubsetError,
} from "@/lib/stabilitySubset";
import {
  ANTHROPIC_MODEL_ID,
  OPENAI_MODEL_ID,
  type TestModelId,
} from "@/lib/models/registry";
import type { ModelCallResult } from "@/lib/models/types";
import type { PromptCondition, RunType } from "@/types";

interface RunRequestBody {
  task_id: string;
  prompt: string;
  model: TestModelId;
  prompt_condition: PromptCondition;
  run_type: RunType;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
  /**
   * C5 — deliberate re-run of an existing main cell. Off unless explicitly set;
   * the design is n=1 for the main study, so a duplicate is an accident by
   * default.
   */
  allow_duplicate_main?: boolean;
}

export async function POST(request: Request) {
  const body: RunRequestBody = await request.json();
  const {
    task_id,
    prompt,
    model,
    prompt_condition,
    run_type,
    temperature,
    max_tokens,
    system_prompt,
    allow_duplicate_main = false,
  } = body;

  if (run_type !== "main" && run_type !== "stability") {
    return NextResponse.json(
      { error: `run_type must be "main" or "stability" (received ${JSON.stringify(run_type)}).` },
      { status: 400 }
    );
  }

  const task = await getTask(task_id);
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const missingPrompts: string[] = [];
  if (!task.baseline_prompt) missingPrompts.push("baseline");
  if (!task.craft_prompt) missingPrompts.push("craft");
  if (missingPrompts.length > 0) {
    return NextResponse.json(
      {
        error: `Run blocked: this task is missing its ${missingPrompts.join(" and ")} prompt${
          missingPrompts.length > 1 ? "s" : ""
        }. Both baseline and CRAFT prompts must be authored before either condition can be run.`,
        missing_prompts: missingPrompts,
      },
      { status: 409 }
    );
  }

  // S2 — the stability subset is frozen; a stability run against an off-list
  // task would change what the variance estimate is based on.
  if (run_type === "stability") {
    try {
      if (!(await isInStabilitySubset(task_id))) {
        const subset = await loadStabilitySubset();
        return NextResponse.json(
          {
            error:
              `Stability run refused: ${task_id} is not in the frozen stability subset. ` +
              `The subset is fixed at ${subset.task_ids.length} tasks drawn with seed ` +
              `${subset.seed} and is not editable.`,
            stability_subset: subset.task_ids,
          },
          { status: 409 }
        );
      }
    } catch (err) {
      if (err instanceof MissingStabilitySubsetError) {
        return NextResponse.json({ error: err.message }, { status: 503 });
      }
      throw err;
    }
  }

  const settings = { temperature, max_tokens, system_prompt };
  const runSettingsHash = await computeRunSettingsHash(settings);

  // 5a — the counterpart condition of this pair must have run under identical
  // decoding settings, or any score difference is confounded by sampling.
  const counterpartCondition: PromptCondition =
    prompt_condition === "baseline" ? "craft" : "baseline";
  const existing = await getResults();

  // C5 — the main study is n=1. A second run for the same cell is an accident
  // unless explicitly requested.
  if (run_type === "main" && !allow_duplicate_main) {
    const duplicate = existing.find(
      (r) =>
        r.run_type === "main" &&
        r.task_id === task_id &&
        r.model_name === model &&
        r.prompt_condition === prompt_condition
    );
    if (duplicate) {
      return NextResponse.json(
        {
          error:
            `Run blocked: a main result already exists for ${task_id} / ${model} / ` +
            `${prompt_condition} (result_id ${duplicate.result_id}, run ${duplicate.run_number}, ` +
            `recorded ${duplicate.run_date}). The main study is n=1. ` +
            `Set allow_duplicate_main to re-run deliberately.`,
          existing_result_id: duplicate.result_id,
          existing_run_date: duplicate.run_date,
        },
        { status: 409 }
      );
    }
  }

  const counterpart = existing.find(
    (r) =>
      r.task_id === task_id &&
      r.model_name === model &&
      r.prompt_condition === counterpartCondition
  );

  if (counterpart && counterpart.run_settings_hash !== runSettingsHash) {
    const mismatches = diffRunSettings(
      {
        temperature: counterpart.temperature,
        max_tokens: counterpart.max_tokens,
        system_prompt: counterpart.system_prompt,
      },
      settings
    );
    return NextResponse.json(
      {
        error:
          `Run blocked: the ${counterpartCondition} run of this pair used different settings. ` +
          mismatches
            .map(
              (m) =>
                `${m.field} was ${JSON.stringify(m.earlier_value)}, this run attempts ` +
                `${JSON.stringify(m.attempted_value)}`
            )
            .join("; ") +
          ". Both conditions of a pair must share identical run settings.",
        mismatches,
        counterpart_result_id: counterpart.result_id,
        counterpart_run_settings_hash: counterpart.run_settings_hash,
      },
      { status: 409 }
    );
  }

  let provenance: string;
  try {
    provenance = await provenanceFingerprintFor(model);
  } catch (err) {
    if (err instanceof MissingManifestError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Provenance lookup failed" },
      { status: 503 }
    );
  }

  const start = Date.now();
  let call: ModelCallResult;

  try {
    if (model === ANTHROPIC_MODEL_ID) {
      call = await callClaude({
        prompt,
        systemPrompt: system_prompt,
        temperature,
        maxTokens: max_tokens,
      });
    } else if (model === OPENAI_MODEL_ID) {
      call = await callOpenAI({
        prompt,
        systemPrompt: system_prompt,
        temperature,
        maxTokens: max_tokens,
      });
    } else {
      return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return NextResponse.json(
        { error: err.message, missing_env_var: err.envVar },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Model call failed" },
      { status: 502 }
    );
  }

  // The token is allocated server-side and is opaque: the client never computes
  // it, and it encodes nothing about task, model, or condition.
  const anonymizedOutputId = await allocateBlindingToken({
    task_id,
    model_name: model,
    prompt_condition,
  });

  return NextResponse.json({
    output: call.text,
    model,
    model_provenance_fingerprint: provenance,
    anonymized_output_id: anonymizedOutputId,
    run_settings_hash: runSettingsHash,
    truncated: call.truncated,
    stop_reason: call.stop_reason,
    latency_ms: Date.now() - start,
  });
}
