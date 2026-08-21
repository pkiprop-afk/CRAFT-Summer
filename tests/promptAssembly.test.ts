import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  composePrompt,
  composedPromptFor,
  taskInputBlock,
} from "../lib/promptAssembly.ts";
import { callWithRetry, classifyCallError, MAX_ATTEMPTS } from "../lib/retry.ts";

const tasks = JSON.parse(
  readFileSync(path.join(process.cwd(), "data", "tasks.json"), "utf-8")
);

describe("I1 — stimulus is byte-identical across conditions", () => {
  test("every task's baseline and CRAFT prompts carry the identical suffix block", () => {
    for (const task of tasks) {
      const baseline = composedPromptFor(task, "baseline");
      const craft = composedPromptFor(task, "craft");
      const block = taskInputBlock(task.task_input);

      assert.ok(
        baseline.endsWith(block),
        `${task.task_id}: baseline prompt does not end with the stimulus block`
      );
      assert.ok(
        craft.endsWith(block),
        `${task.task_id}: CRAFT prompt does not end with the stimulus block`
      );

      // The suffixes must be the same bytes, not merely both present.
      const baselineSuffix = baseline.slice(baseline.length - block.length);
      const craftSuffix = craft.slice(craft.length - block.length);
      assert.equal(
        baselineSuffix,
        craftSuffix,
        `${task.task_id}: stimulus blocks differ between conditions`
      );
    }
  });

  test("every task's composed prompt actually contains its task_input", () => {
    for (const task of tasks) {
      for (const condition of ["baseline", "craft"] as const) {
        const composed = composedPromptFor(task, condition);
        assert.ok(
          composed.includes(task.task_input),
          `${task.task_id}/${condition}: composed prompt is missing task_input`
        );
      }
    }
  });

  test("the prompt body is unchanged ahead of the block", () => {
    for (const task of tasks) {
      const block = taskInputBlock(task.task_input);
      const baseline = composedPromptFor(task, "baseline");
      const craft = composedPromptFor(task, "craft");
      assert.equal(baseline.slice(0, baseline.length - block.length), task.baseline_prompt);
      assert.equal(craft.slice(0, craft.length - block.length), task.craft_prompt);
    }
  });

  test("empty task_input emits no fence at all", () => {
    assert.equal(taskInputBlock(""), "");
    assert.equal(taskInputBlock("   \n  "), "");
    assert.equal(composePrompt("body", ""), "body");
    assert.ok(!composePrompt("body", "").includes("```"));
  });

  test("block format: two newlines, fenced, verbatim", () => {
    assert.equal(composePrompt("BODY", "CODE"), "BODY\n\n```\nCODE\n```");
  });

  test("all 50 tasks have a non-empty stimulus today", () => {
    assert.equal(tasks.length, 50);
    assert.equal(tasks.filter((t: { task_input: string }) => t.task_input.trim()).length, 50);
  });
});

describe("I3/I4 — retry classification", () => {
  test("503 is retryable", () => {
    assert.equal(classifyCallError({ status: 503, message: "overloaded" }).retryable, true);
  });

  test("Google's message-embedded 503 is retryable", () => {
    const err = new Error(
      "[GoogleGenerativeAI Error]: Error fetching from ...: [503 Service Unavailable] This model is currently experiencing high demand."
    );
    assert.equal(classifyCallError(err).retryable, true);
  });

  test("429 rate limiting is retryable", () => {
    assert.equal(classifyCallError({ status: 429, message: "slow down" }).retryable, true);
  });

  test("credit exhaustion is NEVER retryable, even at 429", () => {
    const err = Object.assign(new Error("You have no credits remaining."), { status: 429 });
    const decision = classifyCallError(err);
    assert.equal(decision.retryable, false);
    assert.match(decision.reason, /quota\/credit/);
  });

  test("insufficient_quota is never retryable", () => {
    const err = Object.assign(new Error("insufficient_quota"), { status: 429 });
    assert.equal(classifyCallError(err).retryable, false);
  });

  test("401 is not retryable", () => {
    assert.equal(classifyCallError({ status: 401, message: "bad key" }).retryable, false);
  });

  test("400 parameter rejection is not retryable", () => {
    const err = Object.assign(
      new Error("`temperature` is deprecated for this model."),
      { status: 400 }
    );
    assert.equal(classifyCallError(err).retryable, false);
  });
});

describe("I3/I4 — retry behaviour", () => {
  const noSleep = async () => {};
  const ok = { text: "fine", stop_reason: "end_turn", truncated: false, reasoning_tokens: null };

  test("succeeds first time with no retries logged", async () => {
    const outcome = await callWithRetry(async () => ok, { sleepFn: noSleep });
    assert.equal(outcome.value.text, "fine");
    assert.equal(outcome.attempts.length, 0);
  });

  test("retries a 503 then succeeds, logging the attempt", async () => {
    let calls = 0;
    const outcome = await callWithRetry(
      async () => {
        calls++;
        if (calls === 1) throw Object.assign(new Error("overloaded"), { status: 503 });
        return ok;
      },
      { sleepFn: noSleep }
    );
    assert.equal(calls, 2);
    assert.equal(outcome.attempts.length, 1);
    assert.equal(outcome.attempts[0].http_status, 503);
  });

  test("I4 — an empty 200 is a failure and is retried", async () => {
    let calls = 0;
    const outcome = await callWithRetry(
      async () => {
        calls++;
        if (calls === 1) return { ...ok, text: "   \n  " };
        return ok;
      },
      { sleepFn: noSleep }
    );
    assert.equal(calls, 2);
    assert.equal(outcome.attempts.length, 1);
    assert.match(outcome.attempts[0].reason, /empty response/);
  });

  test("gives up after 3 attempts", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        callWithRetry(
          async () => {
            calls++;
            throw Object.assign(new Error("overloaded"), { status: 503 });
          },
          { sleepFn: noSleep }
        ),
      /All 3 attempts failed/
    );
    assert.equal(calls, MAX_ATTEMPTS);
  });

  test("a persistently empty response fails rather than storing empty text", async () => {
    await assert.rejects(
      () => callWithRetry(async () => ({ ...ok, text: "" }), { sleepFn: noSleep }),
      /All 3 attempts failed/
    );
  });

  test("does not retry a credit failure — fails immediately", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        callWithRetry(
          async () => {
            calls++;
            throw Object.assign(new Error("You have no credits remaining."), { status: 429 });
          },
          { sleepFn: noSleep }
        ),
      /quota\/credit/
    );
    assert.equal(calls, 1, "credit failures must not be retried");
  });

  test("backoff grows exponentially", async () => {
    const delays: number[] = [];
    await assert.rejects(() =>
      callWithRetry(
        async () => {
          throw Object.assign(new Error("overloaded"), { status: 503 });
        },
        {
          sleepFn: async (ms) => {
            delays.push(ms);
          },
        }
      )
    );
    assert.deepEqual(delays, [1000, 2000]);
  });
});
