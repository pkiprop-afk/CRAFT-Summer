import { NextResponse } from "next/server";
import { callClaude } from "@/lib/models/claude";
import { callGemini } from "@/lib/models/gemini";
import { callOpenAI } from "@/lib/models/openai";
import { MissingApiKeyError, isKeyConfigured } from "@/lib/env";
import { FAMILY_LABEL, type ModelFamily } from "@/lib/models/registry";

/**
 * 4h — LIVE key check. Unlike /api/health/keys (presence booleans only), this
 * makes ONE minimal call per provider to confirm the key actually
 * authenticates.
 *
 * MANUAL TRIGGER ONLY. This is deliberately POST-only so that navigation,
 * prefetch, or a stray GET cannot spend tokens, and it is intentionally not
 * referenced by any component or automatic code path. It is the only sanctioned
 * model call before the parity script passes.
 *
 * Covers every provider the study can call. Hand-entered evaluations are not
 * supported by design, so there is no non-API evaluator to probe.
 */

const PROBE_PROMPT = "Reply with the single word: ok";
const PROBE_SYSTEM = "Reply with exactly one word.";

interface ProbeResult {
  family: ModelFamily;
  label: string;
  configured: boolean;
  authenticated: boolean;
  latencyMs: number | null;
  /** Sanitized — never contains key material. */
  error: string | null;
}

function sanitize(err: unknown): string {
  if (err instanceof MissingApiKeyError) return "key missing or blank";
  const message = err instanceof Error ? err.message : "unknown error";
  // Defensive: strip anything resembling a bearer token or sk- style key so a
  // provider error that echoes the credential cannot leak it into the response.
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 300);
}

async function probe(
  family: ModelFamily,
  call: () => Promise<unknown>
): Promise<ProbeResult> {
  const base = { family, label: FAMILY_LABEL[family], configured: isKeyConfigured(family) };
  if (!base.configured) {
    return { ...base, authenticated: false, latencyMs: null, error: "key missing or blank" };
  }
  const started = Date.now();
  try {
    await call();
    return { ...base, authenticated: true, latencyMs: Date.now() - started, error: null };
  } catch (err) {
    return {
      ...base,
      authenticated: false,
      latencyMs: Date.now() - started,
      error: sanitize(err),
    };
  }
}

export async function POST() {
  const probes = await Promise.all([
    probe("anthropic", () =>
      callClaude({ prompt: PROBE_PROMPT, systemPrompt: PROBE_SYSTEM, maxTokens: 5 })
    ),
    probe("openai", () =>
      callOpenAI({ prompt: PROBE_PROMPT, systemPrompt: PROBE_SYSTEM, maxTokens: 5 })
    ),
    probe("google", () => callGemini(PROBE_PROMPT)),
  ]);

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    note: "Manual live credential check. One minimal call per provider. Not a benchmark run.",
    probes,
    allAuthenticated: probes.every((p) => p.authenticated),
    failed: probes.filter((p) => !p.authenticated).map((p) => p.family),
  });
}
