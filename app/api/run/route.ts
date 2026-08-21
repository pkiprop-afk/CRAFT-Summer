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
  ANTHROPIC_MODEL_ID,
  OPENAI_MODEL_ID,
  type TestModelId,
} from "@/lib/models/registry";
import type { ModelCallResult } from "@/lib/models/types";
import type { PromptCondition } from "@/types";

interface RunRequestBody {
  task_id: string;
  prompt: string;
  model: TestModelId;
  prompt_condition: PromptCondition;
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

export async function POST(request: Request) {
  const body: RunRequestBody = await request.json();
  const {
    task_id,
    prompt,
    model,
    prompt_condition,
    temperature,
    max_tokens,
    system_prompt,
  } = body;

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

  const settings = { temperature, max_tokens, system_prompt };
  const runSettingsHash = await computeRunSettingsHash(settings);

  // 5a — the counterpart condition of this pair must have run under identical
  // decoding settings, or any score difference is confounded by sampling.
  const counterpartCondition: PromptCondition =
    prompt_condition === "baseline" ? "craft" : "baseline";
  const existing = await getResults();
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
