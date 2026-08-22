// Type-only: erased at runtime, so this module has no runtime imports and can
// be loaded by a plain Node script as well as by Next.
import type { ModelFamily } from "@/lib/models/registry";

/**
 * CALLABILITY — the third state.
 *
 * A key can be present, authenticate successfully, and list the model, while
 * still being unable to generate anything. Listing endpoints do not consume
 * credit, so an exhausted balance passes every check built on them:
 *
 *   authenticated  key is present and accepted        (list endpoint returns 200)
 *   available      configured model is offered         (model appears in the listing)
 *   callable       a minimal generation actually runs  (THIS module)
 *
 * Only the third proves the study can run. A quota or credit failure is a HARD
 * FAIL: it does not resolve by retrying, and continuing would burn the other
 * providers' budget producing unusable half-cells.
 *
 * Every probe here is one generation of ~10 tokens with a trivial prompt.
 *
 * NOTE: these probes deliberately do NOT reuse lib/models/*.ts. Those wrappers
 * send `temperature`, which claude-sonnet-5 rejects outright — a probe must
 * test the credit path, not trip over an unrelated parameter. Probes therefore
 * send the minimum each API accepts.
 */

export type CallabilityState =
  | "callable"
  | "no_credit"
  | "unauthenticated"
  | "rate_limited"
  | "bad_request"
  | "unreachable"
  /**
   * Returns 200, but so slowly the workload cannot run on it. Reachability is
   * not usability: a judge answering in 42s still passes every status-code
   * check while making a 400-evaluation study take days and exhausting the
   * retry budget on timeouts. Treated as a hard fail.
   */
  | "too_slow";

/**
 * Latency thresholds, measured as the MEDIAN of PROBE_SAMPLES probes so one
 * unlucky call cannot condemn a healthy provider, nor one lucky call excuse a
 * degraded one.
 */
export const LATENCY_WARN_MS = 5_000;
export const LATENCY_FAIL_MS = 10_000;
export const PROBE_SAMPLES = 3;
/**
 * Caps a single probe. Without it a hung provider stalls the mid-batch check
 * for minutes; a probe that hits the cap is itself evidence of too_slow.
 */
export const PROBE_TIMEOUT_MS = 30_000;

export type LatencyState = "ok" | "slow" | "too_slow";

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function classifyLatency(medianMs: number | null): LatencyState {
  if (medianMs === null) return "ok";
  if (medianMs > LATENCY_FAIL_MS) return "too_slow";
  if (medianMs > LATENCY_WARN_MS) return "slow";
  return "ok";
}

export interface CallabilityResult {
  family: ModelFamily;
  model_id: string;
  /** Key present and accepted by the provider. */
  authenticated: boolean;
  /** Configured model offered by the provider — supplied by the caller. */
  available: boolean | null;
  /** A minimal generation succeeded. */
  callable: boolean;
  state: CallabilityState;
  /** Quota/credit exhaustion — stop-work, not retryable. */
  hardFail: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  message: string | null;
  /** Latency of the last probe. Kept for compatibility with single-probe callers. */
  latencyMs: number | null;
  /** Every probe's latency, in order. */
  latencySamplesMs: number[];
  /** The number decisions are made on. */
  latencyMedianMs: number | null;
  latencyState: LatencyState;
}

const PROBE_PROMPT = "Reply with the single word: ok";
const PROBE_MAX_TOKENS = 10;

function sanitize(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/key=[A-Za-z0-9._-]+/gi, "key=[redacted]")
    .slice(0, 400);
}

/**
 * Classifies a failed probe.
 *
 * The important distinction is quota/credit versus rate limiting: both can
 * arrive as HTTP 429, but only the former is terminal. Rate limiting is
 * transient and the batch can keep going; an empty balance cannot be waited
 * out.
 */
export function classifyFailure(
  status: number | null,
  bodyText: string
): { state: CallabilityState; hardFail: boolean; errorCode: string | null } {
  const text = bodyText.toLowerCase();

  const codeMatch = bodyText.match(/"code"\s*:\s*"([^"]+)"/);
  const typeMatch = bodyText.match(/"type"\s*:\s*"([^"]+)"/);
  const statusMatch = bodyText.match(/"status"\s*:\s*"([A-Z_]+)"/);
  const errorCode = codeMatch?.[1] ?? typeMatch?.[1] ?? statusMatch?.[1] ?? null;

  const CREDIT_MARKERS = [
    "insufficient_quota",
    "credit_balance_exhausted",
    "no credits remaining",
    "billing",
    "exceeded your current quota",
    "quota exceeded",
    "out of credit",
    "payment",
  ];
  if (CREDIT_MARKERS.some((m) => text.includes(m))) {
    return { state: "no_credit", hardFail: true, errorCode };
  }

  if (status === 401 || status === 403 || text.includes("authentication_error")) {
    return { state: "unauthenticated", hardFail: true, errorCode };
  }

  if (status === 429) {
    // A 429 with no credit marker is treated as rate limiting: transient.
    // Google's RESOURCE_EXHAUSTED covers both, so an ambiguous 429 is reported
    // as rate_limited but is still a failed probe the caller must weigh.
    return { state: "rate_limited", hardFail: false, errorCode };
  }

  if (status !== null && status >= 400 && status < 500) {
    return { state: "bad_request", hardFail: true, errorCode };
  }

  return { state: "unreachable", hardFail: true, errorCode };
}

type SingleProbe = Omit<
  CallabilityResult,
  "latencySamplesMs" | "latencyMedianMs" | "latencyState"
>;

async function probeOnce(
  family: ModelFamily,
  modelId: string,
  request: (signal: AbortSignal) => Promise<Response>
): Promise<SingleProbe> {
  const base = {
    family,
    model_id: modelId,
    authenticated: false,
    available: null,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = Date.now();
  let response: Response;
  try {
    response = await request(controller.signal);
  } catch (err) {
    const latencyMs = Date.now() - started;
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ...base,
      callable: false,
      // A probe that outran the cap is a latency verdict, not a connectivity one.
      state: aborted ? "too_slow" : "unreachable",
      hardFail: true,
      httpStatus: null,
      errorCode: null,
      message: aborted
        ? `probe exceeded ${PROBE_TIMEOUT_MS} ms and was aborted`
        : sanitize(err instanceof Error ? err.message : "request failed"),
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }

  const latencyMs = Date.now() - started;
  const bodyText = await response.text();

  if (response.ok) {
    return {
      ...base,
      authenticated: true,
      callable: true,
      state: "callable",
      hardFail: false,
      httpStatus: response.status,
      errorCode: null,
      message: null,
      latencyMs,
    };
  }

  const { state, hardFail, errorCode } = classifyFailure(response.status, bodyText);
  return {
    ...base,
    // A quota or rate-limit rejection still proves the credential was accepted.
    authenticated: state !== "unauthenticated",
    callable: false,
    state,
    hardFail,
    httpStatus: response.status,
    errorCode,
    message: sanitize(bodyText),
    latencyMs,
  };
}

/**
 * Probes a provider PROBE_SAMPLES times and judges it on the median.
 *
 * Samples run sequentially on purpose: parallel samples of one endpoint measure
 * our own contention, not the provider's latency. Stops early on a failure that
 * repeating cannot change (no credit, bad key), so a dead provider costs one
 * call rather than three.
 */
async function probe(
  family: ModelFamily,
  modelId: string,
  request: (signal: AbortSignal) => Promise<Response>,
  samples: number = PROBE_SAMPLES
): Promise<CallabilityResult> {
  const latencies: number[] = [];
  let last: SingleProbe | null = null;

  for (let i = 0; i < samples; i++) {
    last = await probeOnce(family, modelId, request);
    if (last.latencyMs !== null) latencies.push(last.latencyMs);
    if (!last.callable) break;
  }

  const result = last!;
  const latencyMedianMs = median(latencies);
  const latencyState = result.callable ? classifyLatency(latencyMedianMs) : "too_slow";

  return {
    ...result,
    // A provider answering above the ceiling is unusable for this workload even
    // though every probe returned 200 — so it is a hard fail, like no credit.
    state: result.callable && latencyState === "too_slow" ? "too_slow" : result.state,
    hardFail: result.hardFail || (result.callable && latencyState === "too_slow"),
    latencySamplesMs: latencies,
    latencyMedianMs,
    latencyState: result.callable ? latencyState : classifyLatency(latencyMedianMs),
  };
}

export function probeAnthropic(
  apiKey: string,
  modelId: string,
  samples?: number
): Promise<CallabilityResult> {
  return probe(
    "anthropic",
    modelId,
    (signal) =>
      fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        signal,
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        // No temperature: claude-sonnet-5 rejects it.
        body: JSON.stringify({
          model: modelId,
          max_tokens: PROBE_MAX_TOKENS,
          messages: [{ role: "user", content: PROBE_PROMPT }],
        }),
      }),
    samples
  );
}

export function probeOpenAI(
  apiKey: string,
  modelId: string,
  samples?: number
): Promise<CallabilityResult> {
  return probe(
    "openai",
    modelId,
    (signal) =>
      fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          max_completion_tokens: PROBE_MAX_TOKENS,
          messages: [{ role: "user", content: PROBE_PROMPT }],
        }),
      }),
    samples
  );
}

export function probeGoogle(
  apiKey: string,
  modelId: string,
  samples?: number
): Promise<CallabilityResult> {
  return probe(
    "google",
    modelId,
    (signal) =>
      fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
        method: "POST",
        signal,
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: PROBE_PROMPT }] }],
          generationConfig: { maxOutputTokens: PROBE_MAX_TOKENS },
        }),
      }),
    samples
  );
}

export interface CallabilityReport {
  checkedAt: string;
  results: CallabilityResult[];
  /**
   * USABLE, not merely reachable: every provider answered AND did so inside the
   * latency ceiling. Callers gate on this, so a provider degraded to 42s halts
   * a run exactly as an error response would.
   */
  allCallable: boolean;
  /** Any quota/credit/auth failure, or latency past the ceiling. */
  hardFailures: CallabilityResult[];
  /** Answering, but above the warning threshold — advisory, not a halt. */
  slow: CallabilityResult[];
}

export function summarize(results: CallabilityResult[]): CallabilityReport {
  return {
    checkedAt: new Date().toISOString(),
    results,
    allCallable: results.every((r) => r.callable && r.latencyState !== "too_slow"),
    hardFailures: results.filter((r) => r.hardFail),
    slow: results.filter((r) => r.callable && r.latencyState === "slow"),
  };
}
