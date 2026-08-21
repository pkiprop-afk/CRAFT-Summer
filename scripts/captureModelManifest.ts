/**
 * M2 — Capture a timestamped model manifest from all three providers.
 *
 * Run once before the study and once after. A change in a configured model's
 * provenance between manifests means the provider moved the model under the
 * study, which invalidates comparability of runs across that boundary.
 *
 * List endpoints only — zero tokens, no generation.
 *
 * Run: npm run capture-model-manifest
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  listAnthropicModels,
  listGoogleModels,
  listOpenAIModels,
  provenanceFingerprint,
  type ProviderListing,
} from "../lib/models/availability.ts";
import { manifestFilename, type ManifestEntry, type ModelManifest } from "../lib/models/manifest.ts";
import { MODEL_FAMILY, type ModelFamily } from "../lib/models/registry.ts";

const ENV_VAR_BY_FAMILY: Record<ModelFamily, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/** Parses .env without shelling out — sourcing echoes secrets on a bad line. */
function readEnvFile(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
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
  const repoRoot = process.cwd();
  const env = { ...readEnvFile(path.join(repoRoot, ".env.local")), ...process.env };
  const keyFor = (f: ModelFamily): string => (env[ENV_VAR_BY_FAMILY[f]] ?? "").trim();

  async function listFor(family: ModelFamily): Promise<ProviderListing> {
    if (!keyFor(family)) {
      return {
        family,
        reachable: false,
        httpStatus: null,
        models: [],
        entries: [],
        error: `${ENV_VAR_BY_FAMILY[family]} is missing or blank`,
      };
    }
    if (family === "anthropic") return listAnthropicModels(keyFor("anthropic"));
    if (family === "openai") return listOpenAIModels(keyFor("openai"));
    return listGoogleModels(keyFor("google"));
  }

  const listings = await Promise.all([listFor("anthropic"), listFor("openai"), listFor("google")]);

  const unreachable = listings.filter((l) => !l.reachable);
  if (unreachable.length > 0) {
    console.error("ABORT — a manifest must cover all three providers.");
    for (const l of unreachable) console.error(`  ${l.family}: ${l.error}`);
    process.exitCode = 1;
    return;
  }

  const configuredIds = new Set(Object.keys(MODEL_FAMILY));
  const capturedAt = new Date().toISOString();

  const entries: ManifestEntry[] = [];
  for (const listing of listings) {
    for (const e of listing.entries) {
      entries.push({
        model_id: e.id,
        family: listing.family,
        created_at: e.created_at,
        display_name: e.display_name,
        version: e.version,
        description: e.description,
        shutdown_date: e.shutdown_date,
        provenance_fingerprint: provenanceFingerprint(e),
        configured: configuredIds.has(e.id),
      });
    }
  }

  const manifest: ModelManifest = {
    captured_at: capturedAt,
    entries,
    providers: listings.map((l) => ({
      family: l.family,
      reachable: l.reachable,
      modelCount: l.models.length,
      createdAtAvailable: l.entries.some((e) => e.created_at !== null),
      error: l.error,
    })),
  };

  const outDir = path.join(repoRoot, "data", "model_manifests");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, manifestFilename(capturedAt));
  writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");

  console.log("MODEL MANIFEST CAPTURED");
  console.log(`captured_at: ${capturedAt}`);
  console.log(`written    : ${path.relative(repoRoot, outPath)}\n`);

  console.log("providers:");
  for (const p of manifest.providers) {
    console.log(
      `  ${p.family.padEnd(10)} models=${String(p.modelCount).padEnd(4)} ` +
        `created_at exposed=${p.createdAtAvailable}`
    );
  }

  console.log("\nconfigured models — provenance recorded:");
  for (const listing of listings) {
    for (const e of listing.entries) {
      if (!configuredIds.has(e.id)) continue;
      console.log(`  ${e.id}`);
      console.log(`    family      : ${listing.family}`);
      console.log(`    created_at  : ${e.created_at ?? "(provider exposes none)"}`);
      if (e.version) console.log(`    version     : ${e.version}`);
      if (e.description) console.log(`    description : ${e.description}`);
      if (e.shutdown_date) console.log(`    SHUTDOWN    : ${e.shutdown_date}`);
      console.log(`    fingerprint : ${provenanceFingerprint(e)}`);
    }
  }

  console.log(
    "\nCapture another manifest after the study; `npm run check-models` compares against the most recent one."
  );
}

main();
