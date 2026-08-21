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

function backoffMs(attempt: number): number {
  // 1s, 2s, 4s …
  return BASE_DELAY_MS * 2 ** (attempt - 1);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function callWithRetry(
  call: () => Promise<ModelCallResult>,
  options: { maxAttempts?: number; sleepFn?: (ms: number) => Promise<void> } = {}
): Promise<RetryOutcome> {
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const wait = options.sleepFn ?? sleep;
  const attempts: RetryAttempt[] = [];

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

    const isLast = attempt === maxAttempts;
    const delay = isLast ? 0 : backoffMs(attempt);
    attempts.push({ attempt, reason, http_status: status, delay_ms: delay });

    if (isLast) {
      throw new RetriesExhaustedError(
        `All ${maxAttempts} attempts failed. Last: ${reason}`,
        attempts
      );
    }
    await wait(delay);
  }

  // Unreachable; the loop either returns or throws.
  throw new RetriesExhaustedError("retry loop exited unexpectedly", attempts);
}
