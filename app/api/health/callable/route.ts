import { NextResponse } from "next/server";
import { ENV_VAR_BY_FAMILY, isKeyConfigured } from "@/lib/env";
import {
  probeAnthropic,
  probeGoogle,
  probeOpenAI,
  summarize,
  type CallabilityResult,
} from "@/lib/callability";
import {
  ANTHROPIC_MODEL_ID,
  GOOGLE_MODEL_ID,
  OPENAI_MODEL_ID,
  type ModelFamily,
} from "@/lib/models/registry";

/**
 * Callability preflight — one minimal generation per provider (~10 tokens).
 *
 * POST-only so navigation or prefetch can never spend tokens, and deliberately
 * not referenced by any automatic path. It is invoked by:
 *   - `npm run check-callable` (pre-batch, after validate)
 *   - the batch runner's periodic mid-run check
 *
 * A quota/credit failure is a HARD FAIL: 503 with the offending providers named.
 */

function keyOf(family: ModelFamily): string {
  return (process.env[ENV_VAR_BY_FAMILY[family]] ?? "").trim();
}

function notConfigured(family: ModelFamily, modelId: string): CallabilityResult {
  return {
    family,
    model_id: modelId,
    authenticated: false,
    available: null,
    callable: false,
    state: "unauthenticated",
    hardFail: true,
    httpStatus: null,
    errorCode: null,
    message: `${ENV_VAR_BY_FAMILY[family]} is missing or blank`,
    latencyMs: null,
  };
}

export async function POST() {
  const results = await Promise.all([
    isKeyConfigured("anthropic")
      ? probeAnthropic(keyOf("anthropic"), ANTHROPIC_MODEL_ID)
      : Promise.resolve(notConfigured("anthropic", ANTHROPIC_MODEL_ID)),
    isKeyConfigured("openai")
      ? probeOpenAI(keyOf("openai"), OPENAI_MODEL_ID)
      : Promise.resolve(notConfigured("openai", OPENAI_MODEL_ID)),
    isKeyConfigured("google")
      ? probeGoogle(keyOf("google"), GOOGLE_MODEL_ID)
      : Promise.resolve(notConfigured("google", GOOGLE_MODEL_ID)),
  ]);

  const report = summarize(results);
  return NextResponse.json(report, { status: report.allCallable ? 200 : 503 });
}
