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

import { readFileSync } from "node:fs";
import path from "node:path";
import {
  checkConfiguredModels,
  listAnthropicModels,
  listGoogleModels,
  listOpenAIModels,
  type ProviderListing,
} from "../lib/models/availability.ts";
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
        label: family,
        reachable: false,
        httpStatus: null,
        models: [],
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

  const { checks, missing, allPresent } = checkConfiguredModels(listings, MODEL_FAMILY);

  console.log("\nconfigured model IDs (from lib/models/registry.ts):");
  for (const c of checks) {
    const mark = c.present ? "OK     " : "MISSING";
    console.log(`  ${mark} ${c.model_id.padEnd(20)} [${c.family}]  ${c.note}`);
  }

  if (!allPresent) {
    console.log("\n--- ABSENT MODELS ---");
    for (const m of missing) {
      console.log(`\n  ${m.model_id} (${m.family}) is NOT offered by the provider.`);
      if (m.similar.length > 0) {
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

  console.log("\nAll configured model IDs are available.");
}

main();
