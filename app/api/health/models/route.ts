import { NextResponse } from "next/server";
import { isKeyConfigured, ENV_VAR_BY_FAMILY } from "@/lib/env";
import {
  checkConfiguredModels,
  listAnthropicModels,
  listGoogleModels,
  listOpenAIModels,
  type ProviderListing,
} from "@/lib/models/availability";
import type { ModelFamily } from "@/lib/models/registry";

/**
 * Availability check for every model ID configured in registry.ts.
 *
 * List endpoints only — zero tokens, no generation. Safe to call before any
 * benchmark run, unlike /api/health/keys/live.
 *
 * Reports absences; never substitutes a replacement.
 */

function keyOf(family: ModelFamily): string {
  return (process.env[ENV_VAR_BY_FAMILY[family]] ?? "").trim();
}

async function listFor(family: ModelFamily): Promise<ProviderListing> {
  if (!isKeyConfigured(family)) {
    return {
      family,
      label: family,
      reachable: false,
      httpStatus: null,
      models: [],
      error: `${ENV_VAR_BY_FAMILY[family]} is missing or blank`,
    };
  }
  if (family === "anthropic") return listAnthropicModels(keyOf("anthropic"));
  if (family === "openai") return listOpenAIModels(keyOf("openai"));
  return listGoogleModels(keyOf("google"));
}

export async function GET() {
  const listings = await Promise.all([
    listFor("anthropic"),
    listFor("openai"),
    listFor("google"),
  ]);

  const { checks, missing, allPresent } = checkConfiguredModels(listings);

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      allPresent,
      missing: missing.map((m) => m.model_id),
      checks,
      providers: listings.map((l) => ({
        family: l.family,
        reachable: l.reachable,
        httpStatus: l.httpStatus,
        modelCount: l.models.length,
        error: l.error,
      })),
    },
    { status: allPresent ? 200 : 503 }
  );
}
