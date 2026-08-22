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
  LATENCY_FAIL_MS,
  LATENCY_WARN_MS,
  PROBE_SAMPLES,
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
  console.log(
    `${PROBE_SAMPLES} minimal generations per provider (~10 tokens each), judged on the median\n` +
      `latency ceiling: warn above ${LATENCY_WARN_MS} ms, HARD FAIL above ${LATENCY_FAIL_MS} ms\n` +
      `(reachability is not usability — a provider answering 200 far too slowly is\n` +
      ` functionally down for a 400-evaluation workload)\n`
  );

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
      latencySamplesMs: [],
      latencyMedianMs: null,
      latencyState: "ok",
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
    "family      model                        auth   avail  callable  median      samples (ms)          state"
  );
  console.log("-".repeat(112));
  for (const r of report.results) {
    const flag =
      r.latencyState === "too_slow" ? " !!" : r.latencyState === "slow" ? " ! " : "   ";
    console.log(
      `${r.family.padEnd(11)} ${r.model_id.padEnd(28)} ` +
        `${String(r.authenticated).padEnd(6)} ${String(r.available).padEnd(6)} ` +
        `${String(r.callable).padEnd(9)} ` +
        `${(r.latencyMedianMs !== null ? `${r.latencyMedianMs}ms` : "n/a").padEnd(9)}${flag} ` +
        `${(r.latencySamplesMs.join(", ") || "-").padEnd(21)} ${r.state}`
    );
  }

  if (report.slow.length > 0) {
    console.log("\n--- SLOW (advisory, not a halt) ---");
    for (const s of report.slow) {
      console.log(
        `  ${s.family}: median ${s.latencyMedianMs} ms is above the ${LATENCY_WARN_MS} ms warning\n` +
          `    threshold but below the ${LATENCY_FAIL_MS} ms ceiling. A batch will run, slowly.`
      );
    }
  }

  const tooSlow = report.results.filter((r) => r.callable && r.latencyState === "too_slow");
  if (tooSlow.length > 0) {
    console.log("\n--- TOO SLOW (HARD FAIL) ---");
    for (const t of tooSlow) {
      console.log(
        `\n  ${t.family} / ${t.model_id}` +
          `\n    median      : ${t.latencyMedianMs} ms  (ceiling ${LATENCY_FAIL_MS} ms)` +
          `\n    samples     : ${t.latencySamplesMs.join(", ")} ms` +
          `\n    NOTE        : every probe returned 200. This provider is REACHABLE but not\n` +
          `                  USABLE — status-code checks pass it while the workload stalls\n` +
          `                  and the retry budget drains on timeouts.`
      );
    }
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
    console.log(
      "PASSED — all providers are callable and within the latency ceiling." +
        (report.slow.length > 0 ? "  (see SLOW advisory above)" : "")
    );
    return;
  }

  const parts: string[] = [];
  if (failures.length > 0) parts.push(`${failures.length} provider(s) not callable`);
  if (tooSlow.length > 0) parts.push(`${tooSlow.length} above the latency ceiling`);
  console.log(
    `FAILED — ${parts.join(", ")}, ` +
      `${report.hardFailures.length} hard failure(s). This is a stop-work condition.`
  );
  process.exitCode = 1;
}

main();
