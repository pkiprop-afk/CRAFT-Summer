"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { BatchTaskSelector } from "@/components/batch/BatchTaskSelector";
import { BatchJobList } from "@/components/batch/BatchJobList";
import { Button } from "@/components/ui/Button";
import { ApiKeyBanner, isFamilyReady, useKeyStatuses } from "@/components/ui/ApiKeyBanner";
import {
  familyOf,
  isFamilyCollision,
  judgesFor,
  MODEL_LABEL,
  TEST_MODELS,
  type EvaluatorModelId,
  type TestModelId,
} from "@/lib/models/registry";
import { DEFAULT_MAX_TOKENS } from "@/lib/runSettings";
import { decodingParamsFor } from "@/lib/decoding";
import { runWithConcurrency } from "@/lib/concurrency";
import { generateEvaluationId, generateResultId } from "@/lib/anonymize";
import {
  buildBatchJobs,
  CHECKPOINT_AFTER_GENERATIONS,
  isTaskReadyForScope,
  isUnpairedScope,
  PAIRED_SCOPE,
  type BatchJob,
  type ConditionScope,
} from "@/lib/batch";
import type {
  EvaluationRecord,
  PromptCondition,
  ResultRecord,
  RunType,
  TaskRecord,
} from "@/types";

type TestModel = TestModelId;

// Cap on simultaneous in-flight model/evaluator calls, to avoid overwhelming
// the upstream APIs or their rate limits during a batch run.
const CONCURRENCY_LIMIT = 3;

// Re-check callability every N completed jobs. Small enough that an exhausted
// balance is caught within a few calls; large enough that the probes are a
// rounding error against a 960-call study.
const CALLABILITY_RECHECK_EVERY = 25;

export default function BatchRunnerPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [rawSelectedIds, setRawSelectedIds] = useState<Set<string>>(new Set());
  const [runType, setRunType] = useState<RunType>("main");
  const [stabilitySubset, setStabilitySubset] = useState<string[] | null>(null);
  const [conditionScope, setConditionScope] = useState<ConditionScope>(PAIRED_SCOPE);
  // 5b — unpaired single-condition runs require an explicit acknowledgement.
  const [allowUnpaired, setAllowUnpaired] = useState(false);
  // The study is 50 tasks x 2 conditions x BOTH models, so both are selected by
  // default and a single pass covers the whole design.
  const [selectedModels, setSelectedModels] = useState<TestModel[]>([...TEST_MODELS]);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");

  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [abortReason, setAbortReason] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  // Distinguishes the planned checkpoint pause from a callability halt: the
  // undispatched jobs stay pending and resumable rather than being marked
  // aborted.
  const [checkpointPaused, setCheckpointPaused] = useState(false);
  const checkpointConsumed = useRef(false);
  // Accumulated time actually spent dispatching, excluding the checkpoint
  // pause — otherwise the projection would include however long the run sat
  // waiting to be reviewed.
  const activeMs = useRef(0);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  // Tracks the next run_number per task_id+condition, seeded from existing
  // results, so concurrent batch jobs never collide on the same run_number.
  const runNumberCounts = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks)
      .catch(() => setLoadError("Failed to load tasks. Try refreshing the page."))
      .finally(() => setLoading(false));
    fetch("/api/results")
      .then((r) => r.json())
      .then((existing: ResultRecord[]) => {
        const counts = new Map<string, number>();
        for (const r of existing) {
          const key = `${r.task_id}::${r.prompt_condition}::${r.run_type}`;
          counts.set(key, Math.max(counts.get(key) ?? 0, r.run_number));
        }
        runNumberCounts.current = counts;
      })
      .catch(() => {});
    // Read-only: the subset is frozen and this page never writes it.
    fetch("/api/stability-subset")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setStabilitySubset(data?.task_ids ?? null))
      .catch(() => setStabilitySubset(null));
  }, []);

  // F1 — run_number sequences per run_type: main is always 1 (n=1), stability
  // is 1..3 within its own series.
  function nextRunNumber(
    taskId: string,
    condition: PromptCondition,
    type: RunType
  ): number {
    const key = `${taskId}::${condition}::${type}`;
    const next = (runNumberCounts.current.get(key) ?? 0) + 1;
    runNumberCounts.current.set(key, next);
    return next;
  }

  // A task that's no longer ready for the active condition scope must not stay
  // effectively selected. Derived during render rather than synced through an
  // effect, so there is no cascading-render round trip — and unlike the old
  // destructive prune, a task returns to the selection if the scope changes
  // back to one it is ready for.
  // S2 — for a stability run, only frozen-subset tasks are eligible. Filtered
  // here as well as rejected server-side, so an off-list task can never even be
  // queued.
  const selectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of rawSelectedIds) {
      const task = tasks.find((t) => t.task_id === id);
      if (!task || !isTaskReadyForScope(task, conditionScope)) continue;
      if (runType === "stability" && !(stabilitySubset ?? []).includes(id)) continue;
      next.add(id);
    }
    return next;
  }, [rawSelectedIds, tasks, conditionScope, runType, stabilitySubset]);

  function toggleTask(taskId: string) {
    setRawSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function selectAllReady() {
    setRawSelectedIds(
      new Set(tasks.filter((t) => isTaskReadyForScope(t, conditionScope)).map((t) => t.task_id))
    );
  }

  function clearSelection() {
    setRawSelectedIds(new Set());
  }

  const pendingJobCount = useMemo(
    () => buildBatchJobs(tasks, selectedIds, conditionScope, selectedModels).length,
    [tasks, selectedIds, conditionScope, selectedModels]
  );

  // C4 — every run calls the test model AND both rotation judges, so preflight
  // must cover all three. Checking only the primary let a missing secondary key
  // fail mid-batch, after generation tokens were already spent.
  const keyStatuses = useKeyStatuses();
  const requiredFamilies = useMemo(() => {
    const families = selectedModels.flatMap((m) => {
      const r = judgesFor(m);
      return [familyOf(m), familyOf(r.primary), familyOf(r.secondary)];
    }).filter((f): f is NonNullable<typeof f> => f !== null);
    return Array.from(new Set(families));
  }, [selectedModels]);

  const keyBlocked =
    requiredFamilies.length < 3 || requiredFamilies.some((f) => !isFamilyReady(keyStatuses, f));

  async function runJob(
    task: TaskRecord,
    condition: PromptCondition,
    model: TestModel,
    jobIndex: number
  ) {
    function updateJob(patch: Partial<BatchJob>) {
      setJobs((prev) => prev.map((j, i) => (i === jobIndex ? { ...j, ...patch } : j)));
    }

    updateJob({ status: "running" });

    try {
      const runResponse = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.task_id,
          model,
          prompt_condition: condition,
          run_type: runType,
          max_tokens: maxTokens,
          system_prompt: systemPrompt,
        }),
      });
      const runData = await runResponse.json();
      if (!runResponse.ok) throw new Error(runData.error ?? "Run failed");

      const timestamp = Date.now();
      const output: string = runData.output;
      // Allocated server-side and opaque — the client never derives it.
      const anonymizedOutputId: string = runData.anonymized_output_id;

      const result: ResultRecord = {
        result_id: generateResultId(),
        task_id: task.task_id,
        task_version: task.task_version,
        model_name: model,
        model_provenance_fingerprint: runData.model_provenance_fingerprint,
        prompt_condition: condition,
        run_number: nextRunNumber(task.task_id, condition, runType),
        run_type: runType,
        decoding_params: runData.decoding_params,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
        run_settings_hash: runData.run_settings_hash,
        run_settings_fields: runData.run_settings_fields,
        run_date: new Date(timestamp).toISOString(),
        raw_model_output: output,
        anonymized_output_id: anonymizedOutputId,
        truncated: Boolean(runData.truncated),
        reasoning_tokens: runData.reasoning_tokens ?? null,
        retry_count: runData.retry_count ?? 0,
        retry_log: runData.retry_log ?? [],
        notes: "",
      };

      // Save the run before evaluating: the output is the expensive artifact,
      // and an evaluation failure must not discard it.
      const saveResponse = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!saveResponse.ok) throw new Error("Failed to save result");

      updateJob({ status: "evaluating" });

      // Both judges of the rotation score every run.
      const rotation = judgesFor(model);
      const judges: Array<{ model: EvaluatorModelId; isPrimary: boolean }> = [
        { model: rotation.primary, isPrimary: true },
        { model: rotation.secondary, isPrimary: false },
      ];

      const totals: number[] = [];
      for (const judge of judges) {
        const evalResponse = await fetch("/api/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            anonymized_output_id: anonymizedOutputId,
            task_description: task.task_description,
            expected_constraints: task.expected_constraints,
            rubric_notes: task.rubric_notes,
            model_response: output,
            evaluator: judge.model,
          }),
        });
        const evalData = await evalResponse.json();
        if (!evalResponse.ok) {
          throw new Error(`${judge.model}: ${evalData.error ?? "Evaluation failed"}`);
        }

        const evalRecord: EvaluationRecord = {
          evaluation_id: generateEvaluationId(),
          result_id: result.result_id,
          evaluator_model: judge.model,
          evaluator_provenance_fingerprint: evalData.evaluator_provenance_fingerprint,
          is_primary: judge.isPrimary,
          evaluated_at: new Date().toISOString(),
          constraint_adherence_score_0_4: evalData.constraint_adherence,
          logical_accuracy_score_0_4: evalData.logical_accuracy,
          completeness_score_0_2: evalData.completeness,
          total_score_0_10: evalData.total,
          retry_count: evalData.evaluator_retry_count ?? 0,
          retry_log: evalData.evaluator_retry_log ?? [],
          evaluator_justification: evalData.justification,
        };

        const saveEval = await fetch("/api/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(evalRecord),
        });
        if (!saveEval.ok) {
          const data = await saveEval.json();
          throw new Error(data.error ?? "Failed to save evaluation");
        }
        totals.push(evalData.total);
      }

      updateJob({
        status: "done",
        total_score: totals.reduce((s, t) => s + t, 0) / totals.length,
      });
    } catch (err) {
      updateJob({ status: "failed", error: err instanceof Error ? err.message : "Job failed" });
    }
  }

  /**
   * Mid-batch callability check. A balance that empties at call 200 of 960 must
   * stop the run cleanly rather than accumulate hundreds of failures and burn
   * the other providers' budget on half-scored cells.
   */
  async function isStillCallable(): Promise<boolean> {
    try {
      const r = await fetch("/api/health/callable", { method: "POST" });
      const report = await r.json();
      if (r.ok && report.allCallable) return true;

      const failures: Array<{ family: string; state: string; message: string | null }> =
        report.results?.filter((x: { callable: boolean }) => !x.callable) ?? [];
      setAbortReason(
        `Run halted by the callability check: ` +
          failures
            .map((f) => `${f.family} is ${f.state}${f.message ? ` — ${f.message}` : ""}`)
            .join("; ")
      );
      return false;
    } catch {
      setAbortReason("Run halted: the callability check could not be reached.");
      return false;
    }
  }

  /**
   * Runs `indices` (positions into `jobList`) with bounded concurrency.
   *
   * Indices are passed rather than the jobs themselves so that a resume can
   * dispatch a sparse subset while every job keeps its ORIGINAL position — the
   * per-job status updates address `jobs` by index, and the checkpoint boundary
   * is defined in terms of original queue position.
   */
  async function dispatchJobs(jobList: BatchJob[], indices: number[]) {
    setAbortReason(null);
    setCheckpointPaused(false);
    setIsRunning(true);

    const legStart = Date.now();
    let lastCheckedAt = 0;
    let pausedHere = false;

    const outcome = await runWithConcurrency(
      indices,
      CONCURRENCY_LIMIT,
      async (jobIndex) => {
        const job = jobList[jobIndex];
        const task = tasks.find((t) => t.task_id === job.task_id);
        if (!task) {
          setJobs((prev) =>
            prev.map((j, i) =>
              i === jobIndex ? { ...j, status: "failed", error: "Task not found" } : j
            )
          );
          return;
        }
        await runJob(task, job.condition, job.model, jobIndex);
      },
      {
        // Synchronous, so the boundary is exact — see lib/concurrency.ts. Gated
        // on the ORIGINAL queue position, not on a completion count: with
        // concurrency > 1 the completion count lags dispatch, and a boundary
        // expressed in completions would overshoot and bisect a pair.
        shouldDispatch: (nextPos) => {
          if (
            !checkpointConsumed.current &&
            indices[nextPos] >= CHECKPOINT_AFTER_GENERATIONS
          ) {
            pausedHere = true;
            return false;
          }
          return true;
        },
        shouldContinue: async (completed) => {
          if (completed < lastCheckedAt + CALLABILITY_RECHECK_EVERY) return true;
          lastCheckedAt = completed;
          return isStillCallable();
        },
        onSkipped: (pos) => {
          const jobIndex = indices[pos];
          setJobs((prev) =>
            prev.map((j, i) =>
              i !== jobIndex
                ? j
                : pausedHere
                  ? // A planned pause, not a failure: leave it queued so Resume
                    // picks it up untouched.
                    { ...j, status: "pending" }
                  : { ...j, status: "aborted", error: "Halted by callability check" }
            )
          );
        },
      }
    );

    activeMs.current += Date.now() - legStart;
    setElapsedMs(activeMs.current);

    if (pausedHere) {
      checkpointConsumed.current = true;
      setCheckpointPaused(true);
    } else if (outcome.aborted) {
      setAbortReason(
        (prev) =>
          (prev ?? "Run halted.") +
          ` ${outcome.completed} job(s) completed before the halt; the rest were not dispatched.`
      );
    }

    setIsRunning(false);
  }

  async function handleStartBatch() {
    if (keyBlocked) return;
    const newJobs = buildBatchJobs(tasks, selectedIds, conditionScope, selectedModels);
    if (newJobs.length === 0) return;

    setJobs(newJobs);
    checkpointConsumed.current = false;
    activeMs.current = 0;
    setElapsedMs(null);

    await dispatchJobs(
      newJobs,
      newJobs.map((_, i) => i)
    );
  }

  /** Continues past the checkpoint with the still-pending jobs. */
  async function handleResume() {
    if (keyBlocked) return;
    const pending = jobs.flatMap((j, i) => (j.status === "pending" ? [i] : []));
    if (pending.length === 0) return;
    checkpointConsumed.current = true;
    await dispatchJobs(jobs, pending);
  }

  if (loading) {
    return <p className="text-sm text-text-muted">Loading tasks…</p>;
  }

  if (loadError) {
    return <p className="text-sm text-error">{loadError}</p>;
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-display font-bold text-text-heading">Batch Runner</h1>

      <ApiKeyBanner statuses={keyStatuses} families={["anthropic", "openai", "google"]} />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">
          Step 1 — Select Tasks and Condition
        </h2>
        <div className="rounded-lg border border-cream-border bg-cream-card px-3 py-2 space-y-2">
          <p className="text-sm font-medium text-text-heading">Run type</p>
          <div className="flex items-center gap-4">
            {(["main", "stability"] as RunType[]).map((rt) => (
              <label key={rt} className="flex items-center gap-2 text-sm text-text-body">
                <input
                  type="radio"
                  checked={runType === rt}
                  disabled={isRunning || (rt === "stability" && !stabilitySubset)}
                  onChange={() => setRunType(rt)}
                />
                {rt === "main" ? "Main study (n=1)" : "Stability (n=3, frozen subset)"}
              </label>
            ))}
          </div>
          {runType === "stability" ? (
            stabilitySubset ? (
              <p className="text-xs text-text-muted">
                Frozen subset — {stabilitySubset.length} tasks, not editable:{" "}
                <span className="font-mono">{stabilitySubset.join(", ")}</span>. Off-list tasks
                cannot be selected and are rejected by the run API.
              </p>
            ) : (
              <p className="text-xs text-error">
                data/stability_subset.json not found — run
                <span className="font-mono"> npm run select-stability-subset</span>.
              </p>
            )
          ) : (
            <p className="text-xs text-text-muted">
              Main study is n=1 per task/model/condition. A duplicate cell is rejected by the run
              API unless deliberately overridden.
            </p>
          )}
        </div>

        <div className="flex items-center gap-4">
          {(["baseline", "craft", "both"] as ConditionScope[]).map((scope) => {
            const unpaired = isUnpairedScope(scope);
            return (
              <label
                key={scope}
                className={`flex items-center gap-2 text-sm capitalize ${
                  unpaired && !allowUnpaired ? "text-text-muted opacity-50" : "text-text-body"
                }`}
                title={
                  unpaired && !allowUnpaired
                    ? "Single-condition runs produce unpaired data — enable the acknowledgement below"
                    : undefined
                }
              >
                <input
                  type="radio"
                  checked={conditionScope === scope}
                  onChange={() => setConditionScope(scope)}
                  disabled={isRunning || (unpaired && !allowUnpaired)}
                />
                {scope}
                {scope === "both" && (
                  <span className="text-xs text-text-muted">(paired — required)</span>
                )}
              </label>
            );
          })}
        </div>

        <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={allowUnpaired}
            disabled={isRunning}
            onChange={(e) => {
              const next = e.target.checked;
              setAllowUnpaired(next);
              // Leaving the acknowledgement snaps back to the paired scope, so
              // an unpaired scope can never remain selected silently.
              if (!next) setConditionScope(PAIRED_SCOPE);
            }}
          />
          <span>
            I am intentionally producing unpaired data. The study is a within-task paired
            comparison; a task run under only one condition contributes nothing to it and will be
            reported as unpaired by the parity check.
          </span>
        </label>

        <BatchTaskSelector
          tasks={tasks}
          conditionScope={conditionScope}
          selectedIds={selectedIds}
          onToggle={toggleTask}
          onSelectAllReady={selectAllReady}
          onClearSelection={clearSelection}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">
          Step 2 — Run Settings and Evaluator
        </h2>

        <div className="space-y-2">
          <p className="text-sm font-medium text-text-heading">Test models</p>
          <div className="flex items-center gap-4">
            {TEST_MODELS.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm text-text-body">
                <input
                  type="checkbox"
                  checked={selectedModels.includes(id)}
                  // Judges follow from the test model via JUDGE_ROTATION; there
                  // is nothing to reset because they were never selectable.
                  onChange={() =>
                    setSelectedModels((prev) =>
                      prev.includes(id)
                        ? prev.filter((m) => m !== id)
                        : // Keep TEST_MODELS order so the queue is deterministic
                          // regardless of the order boxes were ticked.
                          TEST_MODELS.filter((m) => m === id || prev.includes(m))
                    )
                  }
                  disabled={isRunning}
                />
                {MODEL_LABEL[id]}
              </label>
            ))}
          </div>
          {selectedModels.length < TEST_MODELS.length ? (
            <p className="text-xs text-error">
              Only {selectedModels.length} of {TEST_MODELS.length} test models selected — this
              pass will not cover the full design.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* G2/G3 — decoding is fixed by the provider, not chosen here. An
              editable control would imply otherwise. */}
          <div>
            <label className="block text-sm font-medium text-text-heading mb-1">
              Decoding <span className="font-normal text-text-muted">(fixed by provider)</span>
            </label>
            <div className="rounded-lg border border-cream-border bg-cream-card px-3 py-2 space-y-1">
              {selectedModels.map((m) => (
                <div key={m} className="text-sm font-mono text-text-body">
                  <span className="text-text-muted">{MODEL_LABEL[m]}: </span>
                  {JSON.stringify(decodingParamsFor(m))}
                </div>
              ))}
              {selectedModels.length === 0 ? (
                <p className="text-sm text-text-muted">No test model selected.</p>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Claude rejects temperature entirely; effort left at provider default. GPT pins
              temperature to 1.0; reasoning_effort set to &quot;low&quot;. The controls are not
              commensurable, which is why each is recorded per model rather than as one shared
              setting.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-text-heading mb-1">Max Tokens</label>
            <input
              type="number"
              min={1}
              value={maxTokens}
              disabled={isRunning}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 disabled:opacity-50"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-heading mb-1">System Prompt</label>
          <textarea
            value={systemPrompt}
            disabled={isRunning}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-text-muted">
            Keep neutral — do not advantage either prompt condition.
          </p>
        </div>

        {/* C3 — read-only display. The rotation is determined by the producing
            model; it was never a user choice, and a dropdown implied it was. */}
        <div>
          <label className="block text-sm font-medium text-text-heading mb-1">
            Judges <span className="font-normal text-text-muted">(fixed by rotation)</span>
          </label>
          <div className="rounded-lg border border-cream-border bg-cream-card px-3 py-2 space-y-3">
            {selectedModels.map((m) => {
              const r = judgesFor(m);
              const collision =
                isFamilyCollision(m, r.primary) || isFamilyCollision(m, r.secondary);
              return (
                <div key={m} className="space-y-1">
                  <p className="text-xs font-medium text-text-muted">
                    produced by {MODEL_LABEL[m]}
                  </p>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-navy-900 px-2 py-0.5 text-xs text-cream">
                      primary
                    </span>
                    <span className="font-mono text-text-heading">{MODEL_LABEL[r.primary]}</span>
                    <span className="text-xs text-text-muted">({familyOf(r.primary)})</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs text-navy-900">
                      secondary
                    </span>
                    <span className="font-mono text-text-heading">{MODEL_LABEL[r.secondary]}</span>
                    <span className="text-xs text-text-muted">({familyOf(r.secondary)})</span>
                  </div>
                  {collision ? (
                    <p className="text-xs text-error">
                      Rotation misconfigured: family collision.
                    </p>
                  ) : null}
                </div>
              );
            })}
            {selectedModels.length === 0 ? (
              <p className="text-sm text-text-muted">No test model selected.</p>
            ) : null}
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Every run is scored by both judges. The rotation is derived from the producing model
            and is not selectable — note that the primary is the same judge for both, which is
            what makes the two models&apos; scores comparable. A judge sharing the producing
            model&apos;s vendor family is rejected at the API layer.
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">Step 3 — Confirm and Run</h2>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleStartBatch}
            disabled={isRunning || pendingJobCount === 0 || keyBlocked}
          >
            <Layers size={16} />
            {isRunning
              ? "Running batch…"
              : `Start Batch (${pendingJobCount} job${pendingJobCount === 1 ? "" : "s"})`}
          </Button>

          {checkpointPaused && (
            <Button onClick={handleResume} disabled={isRunning || keyBlocked}>
              Resume ({jobs.filter((j) => j.status === "pending").length} remaining)
            </Button>
          )}
        </div>

        {pendingJobCount > CHECKPOINT_AFTER_GENERATIONS && !isRunning && !checkpointPaused && (
          <p className="text-xs text-text-muted">
            The run will pause after {CHECKPOINT_AFTER_GENERATIONS} generations (
            {CHECKPOINT_AFTER_GENERATIONS / 4} tasks — {CHECKPOINT_AFTER_GENERATIONS / 2} complete
            pairs, balanced across both models) so results can be reviewed before the remainder is
            dispatched.
          </p>
        )}

        {checkpointPaused && (
          <div className="rounded-lg border border-navy-500/40 bg-navy-100/40 px-4 py-3">
            <p className="text-sm font-semibold text-text-heading">
              Checkpoint reached — {CHECKPOINT_AFTER_GENERATIONS} generations dispatched
            </p>
            <p className="mt-1 text-xs text-text-body">
              Everything dispatched so far is saved and scored. The remaining{" "}
              {jobs.filter((j) => j.status === "pending").length} job(s) are still queued and were
              not started.
              {elapsedMs !== null
                ? ` Elapsed run time: ${(elapsedMs / 60000).toFixed(1)} min.`
                : ""}
            </p>
            <p className="mt-1 text-xs text-text-muted">
              Run <span className="font-mono">npm run checkpoint</span> for the score
              distribution, then Resume.
            </p>
          </div>
        )}

        {abortReason && (
          <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3">
            <p className="text-sm font-semibold text-error">Batch halted</p>
            <p className="mt-1 text-xs text-error/90">{abortReason}</p>
            <p className="mt-1 text-xs text-error/80">
              Completed jobs are saved. Nothing further was dispatched. Resolve the provider
              issue, then re-run — already-completed main cells will be refused as duplicates,
              so a re-run resumes rather than double-counts.
            </p>
          </div>
        )}

        {jobs.length > 0 && <BatchJobList jobs={jobs} />}
      </section>
    </div>
  );
}
