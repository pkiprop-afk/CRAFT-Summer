/**
 * Startup check — model availability.
 *
 * Confirms every model ID configured in lib/models/registry.ts is actually
 * offered by its provider, using model-LIST endpoints only (zero tokens, no
 * generation). Exits 1 if any configured model is absent.
 *
 * It reports; it never substitutes. A retired test model is a proposal-level
 * change to the study design, not something to silently swap.
 *
 * Run: npm run check-models
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  checkConfiguredModels,
  checkModelIdLiterals,
  listAnthropicModels,
  listGoogleModels,
  listOpenAIModels,
  provenanceFingerprint,
  scanModelIdLiterals,
  type ProviderListing,
} from "../lib/models/availability.ts";
import {
  detectDrift,
  type ManifestEntry,
  type ModelManifest,
} from "../lib/models/manifest.ts";
import { MODEL_FAMILY, type ModelFamily } from "../lib/models/registry.ts";

const ENV_VAR_BY_FAMILY: Record<ModelFamily, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

/**
 * Minimal .env parser. Deliberately does NOT shell out or source the file —
 * sourcing a malformed line makes the shell echo the secret in an error.
 * Values are read into memory and never printed.
 */
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

  const keyFor = (family: ModelFamily): string => (env[ENV_VAR_BY_FAMILY[family]] ?? "").trim();

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

  console.log("MODEL AVAILABILITY CHECK");
  console.log("list endpoints only — zero tokens, no generation\n");

  const listings = await Promise.all([listFor("anthropic"), listFor("openai"), listFor("google")]);

  console.log("providers:");
  for (const l of listings) {
    console.log(
      `  ${l.family.padEnd(10)} reachable=${String(l.reachable).padEnd(5)} ` +
        `models=${String(l.models.length).padEnd(4)}${l.error ? ` error=${l.error}` : ""}`
    );
  }

  const { checks, missing } = checkConfiguredModels(listings, MODEL_FAMILY);

  console.log("\nconfigured model IDs (from lib/models/registry.ts):");
  for (const c of checks) {
    const mark = c.present ? "OK     " : "MISSING";
    console.log(`  ${mark} ${c.model_id.padEnd(20)} [${c.family}]  ${c.note}`);
  }

  // Source scan: every model ID literal anywhere under lib/models/, so a stale
  // pin inside a provider wrapper cannot slip past a registry-only check.
  const modelsDir = path.join(repoRoot, "lib", "models");
  const sourceFiles = readdirSync(modelsDir)
    .filter((f) => f.endsWith(".ts"))
    .map((f) => ({
      path: path.join("lib", "models", f),
      source: readFileSync(path.join(modelsDir, f), "utf-8"),
    }));

  const literals = scanModelIdLiterals(sourceFiles);
  const literalResult = checkModelIdLiterals(literals, listings);

  console.log(`\nmodel ID literals found in lib/models/ (${literals.length}):`);
  for (const c of literalResult.checks) {
    const mark = c.present ? "OK     " : "MISSING";
    console.log(
      `  ${mark} ${c.model_id.padEnd(28)} ${c.file}:${c.line} [${c.family}]  ${c.note}`
    );
  }

  // M3 — provenance drift against the most recently captured manifest.
  const manifestDir = path.join(repoRoot, "data", "model_manifests");
  let driftFailed = false;

  if (!existsSync(manifestDir) || readdirSync(manifestDir).filter((f) => f.endsWith(".json")).length === 0) {
    console.log(
      "\nprovenance drift: no manifest captured yet — run `npm run capture-model-manifest` before the study."
    );
  } else {
    const manifestFiles = readdirSync(manifestDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    const latestPath = path.join(manifestDir, manifestFiles[manifestFiles.length - 1]);
    const previous: ModelManifest = JSON.parse(readFileSync(latestPath, "utf-8"));

    // Build a manifest-shaped view of the live listings to compare against.
    const configuredIds = new Set(Object.keys(MODEL_FAMILY));
    const currentEntries: ManifestEntry[] = [];
    for (const listing of listings) {
      for (const e of listing.entries) {
        currentEntries.push({
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
    const current: ModelManifest = {
      captured_at: new Date().toISOString(),
      entries: currentEntries,
      providers: [],
    };

    const drift = detectDrift(previous, current, Object.keys(MODEL_FAMILY));

    console.log(`\nprovenance drift vs ${path.basename(latestPath)}:`);
    if (drift.length === 0) {
      console.log("  no drift — every configured model matches its captured provenance");
    } else {
      driftFailed = true;
      for (const d of drift) {
        console.log(`  DRIFT ${d.model_id} — ${d.reason}`);
        console.log(`    was: ${d.previous_fingerprint ?? "(absent)"}`);
        console.log(`    now: ${d.current_fingerprint ?? "(absent)"}`);
      }
      console.log(
        "  A configured model moved under the study. Runs before and after this point are not comparable."
      );
    }

    // OpenAI publishes retirement dates; surface them for configured models.
    for (const e of currentEntries) {
      if (e.configured && e.shutdown_date) {
        console.log(`  SHUTDOWN SCHEDULED ${e.model_id} -> ${e.shutdown_date}`);
      }
    }
  }

  const allMissing = [
    ...missing.map((m) => ({ id: m.model_id, where: "registry", similar: m.similar })),
    ...literalResult.missing.map((m) => ({
      id: m.model_id,
      where: `${m.file}:${m.line}`,
      similar: m.similar,
    })),
  ];

  if (allMissing.length > 0) {
    console.log("\n--- ABSENT MODELS ---");
    const seen = new Set<string>();
    for (const m of allMissing) {
      console.log(`\n  ${m.id}  (${m.where}) is NOT offered by the provider.`);
      if (!seen.has(m.id) && m.similar.length > 0) {
        seen.add(m.id);
        console.log("  provider currently offers, same family:");
        for (const s of m.similar) console.log(`    ${s}`);
      }
    }
    console.log(
      "\nNo substitution has been made. Changing a test model alters the study design."
    );
    process.exitCode = 1;
    return;
  }

  if (driftFailed) {
    console.log("\nFAILED — provenance drift detected on a configured model.");
    process.exitCode = 1;
    return;
  }

  console.log("\nAll configured model IDs and all lib/models/ literals are available.");
  console.log("No provenance drift detected.");
}

main();
