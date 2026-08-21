/**
 * Callability preflight — MANDATORY before a batch run, immediately after
 * `npm run validate`.
 *
 * Reports three distinct states per provider:
 *   authenticated  key present and accepted        (listing endpoint)
 *   available      configured model is offered      (listing endpoint)
 *   callable       a minimal generation succeeds    (one ~10-token call)
 *
 * A key can be authenticated and available while being uncallable — listing
 * endpoints do not consume credit, so an exhausted balance passes every
 * check built on them. That gap is exactly what this closes.
 *
 * COSTS TOKENS: one ~10-token generation per provider (three calls total).
 * Exits 1 on any hard failure (quota/credit/auth).
 *
 * Run: npm run check-callable
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  probeAnthropic,
  probeGoogle,
  probeOpenAI,
  summarize,
  type CallabilityResult,
} from "../lib/callability.ts";
import {
  checkConfiguredModels,
  listAnthropicModels,
  listGoogleModels,
  listOpenAIModels,
  type ProviderListing,
} from "../lib/models/availability.ts";
import {
  ANTHROPIC_MODEL_ID,
  GOOGLE_MODEL_ID,
  MODEL_FAMILY,
  OPENAI_MODEL_ID,
  type ModelFamily,
} from "../lib/models/registry.ts";

const REPO = process.cwd();

const ENV_VAR: Record<ModelFamily, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

const MODEL_FOR: Record<ModelFamily, string> = {
  anthropic: ANTHROPIC_MODEL_ID,
  openai: OPENAI_MODEL_ID,
  google: GOOGLE_MODEL_ID,
};

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
  const env = { ...readEnvFile(), ...process.env };
  const keyFor = (f: ModelFamily) => (env[ENV_VAR[f]] ?? "").trim();

  console.log("CALLABILITY PREFLIGHT");
  console.log("one minimal generation per provider (~10 tokens each)\n");

  // Availability first — listing endpoints, free.
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
  const { checks } = checkConfiguredModels(listings, MODEL_FAMILY);
  const availableByModel = new Map(checks.map((c) => [c.model_id, c.present]));

  function notConfigured(family: ModelFamily): CallabilityResult {
    return {
      family,
      model_id: MODEL_FOR[family],
      authenticated: false,
      available: null,
      callable: false,
      state: "unauthenticated",
      hardFail: true,
      httpStatus: null,
      errorCode: null,
      message: `${ENV_VAR[family]} is missing or blank`,
      latencyMs: null,
    };
  }

  const results = await Promise.all([
    keyFor("anthropic")
      ? probeAnthropic(keyFor("anthropic"), ANTHROPIC_MODEL_ID)
      : Promise.resolve(notConfigured("anthropic")),
    keyFor("openai")
      ? probeOpenAI(keyFor("openai"), OPENAI_MODEL_ID)
      : Promise.resolve(notConfigured("openai")),
    keyFor("google")
      ? probeGoogle(keyFor("google"), GOOGLE_MODEL_ID)
      : Promise.resolve(notConfigured("google")),
  ]);

  for (const r of results) {
    r.available = availableByModel.get(r.model_id) ?? null;
  }

  const report = summarize(results);

  console.log(
    "family      model                        authenticated  available  callable  state"
  );
  console.log("-".repeat(96));
  for (const r of report.results) {
    console.log(
      `${r.family.padEnd(11)} ${r.model_id.padEnd(28)} ` +
        `${String(r.authenticated).padEnd(14)} ${String(r.available).padEnd(10)} ` +
        `${String(r.callable).padEnd(9)} ${r.state}` +
        (r.latencyMs !== null ? `  (${r.latencyMs}ms)` : "")
    );
  }

  const failures = report.results.filter((r) => !r.callable);
  if (failures.length > 0) {
    console.log("\n--- FAILURES ---");
    for (const f of failures) {
      console.log(`\n  ${f.family} / ${f.model_id}`);
      console.log(`    state       : ${f.state}${f.hardFail ? "  (HARD FAIL)" : "  (transient)"}`);
      console.log(`    http        : ${f.httpStatus ?? "n/a"}`);
      console.log(`    error code  : ${f.errorCode ?? "n/a"}`);
      console.log(`    message     : ${f.message ?? "n/a"}`);
      if (f.state === "no_credit") {
        console.log(
          "    NOTE        : quota/credit exhaustion does not resolve by retrying.\n" +
            "                  The run must not start; other providers' budget would be\n" +
            "                  spent producing incomplete cells."
        );
      }
      if (f.authenticated && f.available && !f.callable) {
        console.log(
          "    NOTE        : authenticated and available but NOT callable — exactly the\n" +
            "                  gap that listing-only checks miss."
        );
      }
    }
  }

  console.log("");
  if (report.allCallable) {
    console.log("PASSED — all providers are callable.");
    return;
  }

  console.log(
    `FAILED — ${failures.length} provider(s) not callable, ` +
      `${report.hardFailures.length} hard failure(s). This is a stop-work condition.`
  );
  process.exitCode = 1;
}

main();
