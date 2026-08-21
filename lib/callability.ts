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
  | "unreachable";

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
  latencyMs: number | null;
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

async function probe(
  family: ModelFamily,
  modelId: string,
  request: () => Promise<Response>
): Promise<CallabilityResult> {
  const base = {
    family,
    model_id: modelId,
    authenticated: false,
    available: null,
    latencyMs: null as number | null,
  };

  const started = Date.now();
  let response: Response;
  try {
    response = await request();
  } catch (err) {
    return {
      ...base,
      callable: false,
      state: "unreachable",
      hardFail: true,
      httpStatus: null,
      errorCode: null,
      message: sanitize(err instanceof Error ? err.message : "request failed"),
      latencyMs: Date.now() - started,
    };
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

export function probeAnthropic(apiKey: string, modelId: string): Promise<CallabilityResult> {
  return probe("anthropic", modelId, () =>
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
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
    })
  );
}

export function probeOpenAI(apiKey: string, modelId: string): Promise<CallabilityResult> {
  return probe("openai", modelId, () =>
    fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelId,
        max_completion_tokens: PROBE_MAX_TOKENS,
        messages: [{ role: "user", content: PROBE_PROMPT }],
      }),
    })
  );
}

export function probeGoogle(apiKey: string, modelId: string): Promise<CallabilityResult> {
  return probe("google", modelId, () =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: PROBE_PROMPT }] }],
        generationConfig: { maxOutputTokens: PROBE_MAX_TOKENS },
      }),
    })
  );
}

export interface CallabilityReport {
  checkedAt: string;
  results: CallabilityResult[];
  allCallable: boolean;
  /** Any quota/credit/auth failure — the run must not start or continue. */
  hardFailures: CallabilityResult[];
}

export function summarize(results: CallabilityResult[]): CallabilityReport {
  return {
    checkedAt: new Date().toISOString(),
    results,
    allCallable: results.every((r) => r.callable),
    hardFailures: results.filter((r) => r.hardFail),
  };
}
