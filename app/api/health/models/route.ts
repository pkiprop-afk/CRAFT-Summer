import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isKeyConfigured, ENV_VAR_BY_FAMILY } from "@/lib/env";
import {
  checkConfiguredModels,
  checkModelIdLiterals,
  listAnthropicModels,
  listGoogleModels,
  listOpenAIModels,
  scanModelIdLiterals,
  type ProviderListing,
} from "@/lib/models/availability";
import { MODEL_FAMILY, type ModelFamily } from "@/lib/models/registry";

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

  const { checks, missing, allPresent } = checkConfiguredModels(listings, MODEL_FAMILY);

  // Also scan every model ID literal under lib/models/ — the wrappers pin their
  // own IDs, so a registry-only check can pass while a wrapper calls a retired
  // model.
  let literalChecks: ReturnType<typeof checkModelIdLiterals> = {
    checks: [],
    missing: [],
    allPresent: true,
  };
  try {
    const modelsDir = path.join(process.cwd(), "lib", "models");
    const sourceFiles = readdirSync(modelsDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => ({
        path: `lib/models/${f}`,
        source: readFileSync(path.join(modelsDir, f), "utf-8"),
      }));
    literalChecks = checkModelIdLiterals(scanModelIdLiterals(sourceFiles), listings);
  } catch {
    // Sources unavailable (e.g. a packaged build) — registry check still applies.
  }

  const ok = allPresent && literalChecks.allPresent;

  return NextResponse.json(
    {
      checkedAt: new Date().toISOString(),
      allPresent: ok,
      missing: [
        ...missing.map((m) => m.model_id),
        ...literalChecks.missing.map((m) => `${m.model_id} (${m.file}:${m.line})`),
      ],
      checks,
      literalChecks: literalChecks.checks,
      providers: listings.map((l) => ({
        family: l.family,
        reachable: l.reachable,
        httpStatus: l.httpStatus,
        modelCount: l.models.length,
        error: l.error,
      })),
    },
    { status: ok ? 200 : 503 }
  );
}
