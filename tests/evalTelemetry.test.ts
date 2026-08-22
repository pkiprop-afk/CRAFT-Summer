import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  computeEvalAttemptStats,
  type EvalAttemptOutcome,
  type EvalAttemptRecord,
} from "../lib/evalTelemetry.ts";

const mk = (
  outcome: EvalAttemptOutcome,
  retry_count = 0,
  is_primary = true
): EvalAttemptRecord => ({
  recorded_at: "2026-08-21T20:00:00.000Z",
  evaluator_model: is_primary ? "gemini-3.7-flash" : "gpt-5.5-2026-04-23",
  is_primary,
  anonymized_output_id: "OUT-0001",
  outcome,
  retry_count,
  http_status: null,
  message: null,
});

describe("M1 — failures stay in the denominator", () => {
  test("the old saved-rows metric understated; this one does not", () => {
    // 10 attempts: 2 retried-then-succeeded, 5 exhausted, 3 clean.
    // Saved evaluations would be only the 5 successes, giving 2/5 = 40%.
    // Over all attempts the retry rate is 7/10 = 70%, because the 5 exhausted
    // attempts also consumed their retries.
    const attempts = [
      ...Array.from({ length: 3 }, () => mk("succeeded_first_try", 0)),
      ...Array.from({ length: 2 }, () => mk("succeeded_after_retry", 1)),
      ...Array.from({ length: 5 }, () => mk("exhausted", 2)),
    ];
    const st = computeEvalAttemptStats(attempts);
    assert.equal(st.total, 10);
    assert.equal(st.retried, 7);
    assert.equal(st.retryRate, 0.7);
    assert.equal(st.failed, 5);
    assert.equal(st.failureRate, 0.5);
  });

  test("the metric gets WORSE as failures mount, not better", () => {
    // The defect being fixed: dropping failures from the denominator made the
    // rate fall as the provider degraded.
    const healthy = computeEvalAttemptStats([
      ...Array.from({ length: 9 }, () => mk("succeeded_first_try")),
      mk("succeeded_after_retry", 1),
    ]);
    const degraded = computeEvalAttemptStats([
      ...Array.from({ length: 9 }, () => mk("succeeded_first_try")),
      ...Array.from({ length: 9 }, () => mk("exhausted", 2)),
      mk("succeeded_after_retry", 1),
    ]);
    assert.ok(
      degraded.retryRate! > healthy.retryRate!,
      "a provider failing more must not report a lower retry rate"
    );
    assert.ok(degraded.failureRate! > healthy.failureRate!);
  });

  test("retry count comes from retry_count, not the outcome label", () => {
    // An attempt that retried and THEN failed to parse still used retries.
    const st = computeEvalAttemptStats([mk("unparseable", 2)]);
    assert.equal(st.retried, 1);
    assert.equal(st.retryRate, 1);
    assert.equal(st.unparseable, 1);
    assert.equal(st.failureRate, 1);
  });

  test("every failure kind counts as failed", () => {
    const st = computeEvalAttemptStats([
      mk("exhausted", 2),
      mk("unparseable", 0),
      mk("failed_non_retryable", 0),
      mk("succeeded_first_try", 0),
    ]);
    assert.equal(st.failed, 3);
    assert.equal(st.succeeded, 1);
    assert.equal(st.failureRate, 0.75);
  });

  test("primary-judge figures are tracked separately", () => {
    const st = computeEvalAttemptStats([
      mk("succeeded_first_try", 0, true),
      mk("exhausted", 2, true),
      mk("succeeded_first_try", 0, false),
      mk("succeeded_after_retry", 1, false),
    ]);
    assert.equal(st.primaryTotal, 2);
    assert.equal(st.primaryRetried, 1);
    assert.equal(st.primaryFailed, 1);
  });

  test("per-judge reliability separates the primary from the secondaries", () => {
    // The observed pattern: every retry is the primary judge, secondaries clean.
    const st = computeEvalAttemptStats([
      ...Array.from({ length: 5 }, () => mk("succeeded_after_retry", 1, true)),
      mk("succeeded_first_try", 0, true),
      ...Array.from({ length: 5 }, () => mk("succeeded_first_try", 0, false)),
    ]);
    const primary = st.byJudge.find((j) => j.evaluator_model === "gemini-3.7-flash")!;
    const secondary = st.byJudge.find((j) => j.evaluator_model === "gpt-5.5-2026-04-23")!;
    assert.equal(primary.role, "primary");
    assert.equal(primary.attempts, 6);
    assert.equal(primary.retried, 5);
    assert.ok(Math.abs(primary.retryRate! - 5 / 6) < 1e-9);
    assert.equal(secondary.role, "secondary");
    assert.equal(secondary.retried, 0);
    assert.equal(secondary.retryRate, 0);
  });

  test("a judge with no attempts of its own does not appear", () => {
    const st = computeEvalAttemptStats([mk("succeeded_first_try", 0, true)]);
    assert.equal(st.byJudge.length, 1);
    assert.equal(st.byJudge[0].evaluator_model, "gemini-3.7-flash");
  });

  test("an empty run has no rate rather than a zero rate", () => {
    const st = computeEvalAttemptStats([]);
    assert.equal(st.total, 0);
    assert.equal(st.retryRate, null);
    assert.equal(st.failureRate, null);
  });

  test("a clean run is 0% on both", () => {
    const st = computeEvalAttemptStats(
      Array.from({ length: 20 }, () => mk("succeeded_first_try"))
    );
    assert.equal(st.retryRate, 0);
    assert.equal(st.failureRate, 0);
  });

  test("the stop thresholds fire on the observed failure pattern", () => {
    // The run I halted: ~50% of jobs failing on the primary judge.
    const st = computeEvalAttemptStats([
      ...Array.from({ length: 3 }, () => mk("succeeded_first_try")),
      ...Array.from({ length: 2 }, () => mk("succeeded_after_retry", 2)),
      ...Array.from({ length: 3 }, () => mk("exhausted", 2)),
    ]);
    assert.ok(st.failureRate! > 0.10, "failure rate must cross the 10% threshold");
    assert.ok(st.retryRate! > 0.20, "retry rate must cross the 20% threshold");
  });
});
