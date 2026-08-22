import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  classifyFailure,
  classifyLatency,
  LATENCY_FAIL_MS,
  LATENCY_WARN_MS,
  median,
  summarize,
  type CallabilityResult,
} from "../lib/callability.ts";
import { runWithConcurrency } from "../lib/concurrency.ts";

/**
 * Classifier tests use recorded provider payloads — no network, no model calls.
 */

const OPENAI_NO_CREDIT = JSON.stringify({
  error: {
    message:
      "You have no credits remaining. Add credits to continue using the API at https://platform.openai.com/settings/organization/billing/.",
    type: "insufficient_quota",
    param: null,
    code: "credit_balance_exhausted",
  },
});

const ANTHROPIC_BAD_PARAM = JSON.stringify({
  type: "error",
  error: { type: "invalid_request_error", message: "`temperature` is deprecated for this model." },
});

const ANTHROPIC_AUTH = JSON.stringify({
  type: "error",
  error: { type: "authentication_error", message: "invalid x-api-key" },
});

const GOOGLE_QUOTA = JSON.stringify({
  error: {
    code: 429,
    message: "Quota exceeded for quota metric 'Generate Content API requests per minute'.",
    status: "RESOURCE_EXHAUSTED",
  },
});

const GENERIC_RATE_LIMIT = JSON.stringify({
  error: { type: "rate_limit_error", message: "Number of requests has exceeded the limit." },
});

describe("callability — failure classification", () => {
  test("OpenAI credit exhaustion is a HARD FAIL", () => {
    const c = classifyFailure(429, OPENAI_NO_CREDIT);
    assert.equal(c.state, "no_credit");
    assert.equal(c.hardFail, true);
    assert.equal(c.errorCode, "credit_balance_exhausted");
  });

  test("Google quota exhaustion is a HARD FAIL, not treated as transient", () => {
    const c = classifyFailure(429, GOOGLE_QUOTA);
    assert.equal(c.state, "no_credit");
    assert.equal(c.hardFail, true);
  });

  test("a plain 429 with no credit marker is transient rate limiting", () => {
    const c = classifyFailure(429, GENERIC_RATE_LIMIT);
    assert.equal(c.state, "rate_limited");
    assert.equal(c.hardFail, false);
  });

  test("401 is unauthenticated and a hard fail", () => {
    const c = classifyFailure(401, ANTHROPIC_AUTH);
    assert.equal(c.state, "unauthenticated");
    assert.equal(c.hardFail, true);
  });

  test("a 400 parameter rejection is a hard fail, not a credit problem", () => {
    const c = classifyFailure(400, ANTHROPIC_BAD_PARAM);
    assert.equal(c.state, "bad_request");
    assert.equal(c.hardFail, true);
    assert.notEqual(c.state, "no_credit");
  });

  test("a network failure is unreachable", () => {
    const c = classifyFailure(null, "getaddrinfo ENOTFOUND");
    assert.equal(c.state, "unreachable");
    assert.equal(c.hardFail, true);
  });
});

describe("callability — report summary", () => {
  const make = (over: Partial<CallabilityResult>): CallabilityResult => ({
    family: "openai",
    model_id: "gpt-5.5-2026-04-23",
    authenticated: true,
    available: true,
    callable: true,
    state: "callable",
    hardFail: false,
    httpStatus: 200,
    errorCode: null,
    message: null,
    latencyMs: 100,
    latencySamplesMs: [100, 100, 100],
    latencyMedianMs: 100,
    latencyState: "ok",
    ...over,
  });

  test("all callable passes", () => {
    const r = summarize([make({}), make({ family: "google" })]);
    assert.equal(r.allCallable, true);
    assert.equal(r.hardFailures.length, 0);
  });

  test("authenticated + available but not callable is still a failure", () => {
    // Exactly the state that listing-only checks miss.
    const r = summarize([
      make({
        authenticated: true,
        available: true,
        callable: false,
        state: "no_credit",
        hardFail: true,
      }),
    ]);
    assert.equal(r.allCallable, false);
    assert.equal(r.hardFailures.length, 1);
    assert.equal(r.hardFailures[0].authenticated, true);
    assert.equal(r.hardFailures[0].available, true);
  });

  test("a provider answering 200 above the ceiling is NOT usable", () => {
    // The gemini-3.7-flash failure mode: every probe returns 200 at ~42s, so
    // every status-code check passes while the workload is unrunnable.
    const r = summarize([
      make({}),
      make({
        family: "google",
        callable: true,
        state: "too_slow",
        hardFail: true,
        latencySamplesMs: [42503, 39120, 44890],
        latencyMedianMs: 42503,
        latencyState: "too_slow",
      }),
    ]);
    assert.equal(r.allCallable, false, "reachable must not imply usable");
    assert.equal(r.hardFailures.length, 1);
    assert.equal(r.hardFailures[0].callable, true, "it did answer — that is the point");
  });

  test("slow but under the ceiling is advisory, not a halt", () => {
    const r = summarize([
      make({ latencyMedianMs: 6500, latencyState: "slow", latencySamplesMs: [6000, 6500, 7000] }),
    ]);
    assert.equal(r.allCallable, true);
    assert.equal(r.slow.length, 1);
    assert.equal(r.hardFailures.length, 0);
  });
});

describe("latency ceiling", () => {
  test("median ignores a single outlier in either direction", () => {
    assert.equal(median([100, 120, 42000]), 120);
    assert.equal(median([42000, 41000, 90]), 41000);
  });

  test("median of an even sample averages the middle pair", () => {
    assert.equal(median([100, 200, 300, 400]), 250);
  });

  test("empty sample has no median and does not condemn", () => {
    assert.equal(median([]), null);
    assert.equal(classifyLatency(null), "ok");
  });

  test("thresholds are exclusive at the boundary", () => {
    assert.equal(classifyLatency(LATENCY_WARN_MS), "ok");
    assert.equal(classifyLatency(LATENCY_WARN_MS + 1), "slow");
    assert.equal(classifyLatency(LATENCY_FAIL_MS), "slow");
    assert.equal(classifyLatency(LATENCY_FAIL_MS + 1), "too_slow");
  });

  test("the observed gemini degradation classifies as too_slow", () => {
    assert.equal(classifyLatency(42503), "too_slow");
  });

  test("this morning's gemini latency classifies as ok", () => {
    assert.equal(classifyLatency(867), "ok");
  });
});

describe("mid-batch abort", () => {
  test("stops dispatching once the check fails, and reports skipped items", async () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const processed: number[] = [];
    const skipped: number[] = [];

    const outcome = await runWithConcurrency(
      items,
      1,
      async (item) => {
        processed.push(item);
      },
      {
        // Halt after 4 completed jobs.
        shouldContinue: (completed) => completed < 4,
        onSkipped: (index) => skipped.push(index),
      }
    );

    assert.equal(outcome.aborted, true);
    assert.equal(outcome.completed, 4);
    assert.equal(processed.length, 4);
    assert.ok(skipped.length > 0, "remaining items should be reported as skipped");
    assert.equal(processed.length + skipped.length, items.length);
  });

  test("runs to completion when the check keeps passing", async () => {
    const items = [1, 2, 3, 4, 5];
    const processed: number[] = [];
    const outcome = await runWithConcurrency(
      items,
      2,
      async (item) => {
        processed.push(item);
      },
      { shouldContinue: () => true }
    );
    assert.equal(outcome.aborted, false);
    assert.equal(outcome.completed, 5);
    assert.equal(processed.length, 5);
  });

  test("with no options it behaves as before", async () => {
    const processed: number[] = [];
    const outcome = await runWithConcurrency([1, 2, 3], 2, async (i) => {
      processed.push(i);
    });
    assert.equal(outcome.aborted, false);
    assert.equal(processed.length, 3);
  });
});
