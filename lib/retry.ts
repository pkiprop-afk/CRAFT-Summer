import type { ModelCallResult } from "@/lib/models/types";

/**
 * I3/I4 — Bounded retry for transient provider failures.
 *
 * Retryable:
 *   - HTTP 503 (provider overload; observed on gemini-3.7-flash mid-smoke-test)
 *   - HTTP 429 that is rate limiting, NOT quota exhaustion
 *   - HTTP 200 with empty or whitespace-only text (I4)
 *
 * Never retryable:
 *   - quota/credit exhaustion — waiting does not refill a balance, and
 *     retrying burns wall-clock while the run is already doomed
 *   - authentication failures
 *   - 4xx parameter rejections
 *
 * An empty 200 is treated as failure rather than success because a stored empty
 * output would be scored by the judges as a maximally non-compliant answer,
 * silently turning a provider glitch into a real-looking zero.
 */

export const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1000;

/**
 * Judges get a more patient policy than generations.
 *
 * Generation is not what fails — across the run its retry count is 0. The judge
 * providers are, and a 3-attempt budget with 1s/2s backoff is too short for a
 * provider that is answering in ~10s: the budget is spent before the degraded
 * window passes, and the cell is stranded with a generation already paid for.
 *
 * 5 attempts at 2s/4s/8s/16s absorbs a ~30s window. TOTAL_WAIT_CAP_MS bounds the
 * damage a single hung evaluation can do to the queue.
 *
 * This changes only how patiently we wait. Same judges, same prompt, same
 * rubric, same scores.
 */
export const JUDGE_MAX_ATTEMPTS = 5;
export const JUDGE_BASE_DELAY_MS = 2000;
export const JUDGE_TOTAL_WAIT_CAP_MS = 60_000;

export const JUDGE_RETRY_POLICY = {
  maxAttempts: JUDGE_MAX_ATTEMPTS,
  baseDelayMs: JUDGE_BASE_DELAY_MS,
  totalWaitCapMs: JUDGE_TOTAL_WAIT_CAP_MS,
} as const;

export interface RetryAttempt {
  attempt: number;
  reason: string;
  http_status: number | null;
  delay_ms: number;
}

export interface RetryOutcome {
  value: ModelCallResult;
  attempts: RetryAttempt[];
}

export class NonRetryableError extends Error {
  readonly httpStatus: number | null;
  constructor(message: string, httpStatus: number | null) {
    super(message);
    this.name = "NonRetryableError";
    this.httpStatus = httpStatus;
  }
}

export class RetriesExhaustedError extends Error {
  readonly attempts: RetryAttempt[];
  constructor(message: string, attempts: RetryAttempt[]) {
    super(message);
    this.name = "RetriesExhaustedError";
    this.attempts = attempts;
  }
}

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

/** Provider SDKs surface status differently; normalize. */
export function statusOf(err: unknown): number | null {
  if (typeof err === "object" && err !== null) {
    const maybe = err as { status?: unknown; statusCode?: unknown };
    if (typeof maybe.status === "number") return maybe.status;
    if (typeof maybe.statusCode === "number") return maybe.statusCode;
  }
  // Google's SDK embeds the code in the message, e.g. "[503 Service Unavailable]".
  const message = err instanceof Error ? err.message : String(err);
  const match = message.match(/\[(\d{3})\s/);
  return match ? Number(match[1]) : null;
}

export interface RetryDecision {
  retryable: boolean;
  reason: string;
}

export function classifyCallError(err: unknown): RetryDecision {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = statusOf(err);

  if (CREDIT_MARKERS.some((m) => message.includes(m))) {
    return { retryable: false, reason: "quota/credit exhausted — not retryable" };
  }
  if (status === 401 || status === 403) {
    return { retryable: false, reason: "authentication failure — not retryable" };
  }
  if (status === 503) {
    return { retryable: true, reason: "503 provider overload" };
  }
  if (status === 429) {
    return { retryable: true, reason: "429 rate limited" };
  }
  if (status !== null && status >= 500) {
    return { retryable: true, reason: `${status} upstream error` };
  }
  return { retryable: false, reason: status ? `${status} not retryable` : "not retryable" };
}

function backoffMs(attempt: number, baseDelayMs: number): number {
  // base, 2x, 4x … — 1s/2s for generations, 2s/4s/8s/16s for judges.
  return baseDelayMs * 2 ** (attempt - 1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callWithRetry(
  call: () => Promise<ModelCallResult>,
  options: {
    maxAttempts?: number;
    baseDelayMs?: number;
    /** Stops retrying once cumulative backoff would exceed this. */
    totalWaitCapMs?: number;
    sleepFn?: (ms: number) => Promise<void>;
  } = {}
): Promise<RetryOutcome> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const baseDelayMs = options.baseDelayMs ?? BASE_DELAY_MS;
  const totalWaitCapMs = options.totalWaitCapMs ?? Infinity;
  const wait = options.sleepFn ?? sleep;
  const attempts: RetryAttempt[] = [];
  let waitedMs = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let result: ModelCallResult | null = null;
    let decision: RetryDecision | null = null;
    let status: number | null = null;
    let reason = "";

    try {
      result = await call();
      // I4 — an empty 200 is a failure.
      if (result.text.trim().length === 0) {
        reason = "empty response body (HTTP 200 with no text)";
        decision = { retryable: true, reason };
        status = 200;
      } else {
        return { value: result, attempts };
      }
    } catch (err) {
      decision = classifyCallError(err);
      status = statusOf(err);
      reason = `${decision.reason}: ${
        err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)
      }`;
      if (!decision.retryable) {
        throw new NonRetryableError(reason, status);
      }
    }

    const nextDelay = backoffMs(attempt, baseDelayMs);
    // Stop if this is the last attempt, or if waiting again would push the
    // cumulative backoff past the cap — one call must not hold the queue open
    // indefinitely just because the budget allows more attempts.
    const wouldExceedCap = waitedMs + nextDelay > totalWaitCapMs;
    const isLast = attempt === maxAttempts || wouldExceedCap;
    const delay = isLast ? 0 : nextDelay;
    attempts.push({ attempt, reason, http_status: status, delay_ms: delay });

    if (isLast) {
      throw new RetriesExhaustedError(
        wouldExceedCap && attempt < maxAttempts
          ? `Stopped after ${attempt} attempt(s): total backoff would exceed ` +
            `${totalWaitCapMs} ms. Last: ${reason}`
          : `All ${maxAttempts} attempts failed. Last: ${reason}`,
        attempts
      );
    }
    waitedMs += delay;
    await wait(delay);
  }

  // Unreachable; the loop either returns or throws.
  throw new RetriesExhaustedError("retry loop exited unexpectedly", attempts);
}
