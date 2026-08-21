"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { BatchTaskSelector } from "@/components/batch/BatchTaskSelector";
import { BatchJobList } from "@/components/batch/BatchJobList";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
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
import { runWithConcurrency } from "@/lib/concurrency";
import { generateEvaluationId, generateResultId } from "@/lib/anonymize";
import {
  buildBatchJobs,
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
type BatchEvaluator = EvaluatorModelId;

// Cap on simultaneous in-flight model/evaluator calls, to avoid overwhelming
// the upstream APIs or their rate limits during a batch run.
const CONCURRENCY_LIMIT = 3;

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
  const [testModel, setTestModel] = useState<TestModel>(TEST_MODELS[0]);
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  const [evaluatorChoice, setEvaluatorChoice] = useState<BatchEvaluator>(judgesFor(TEST_MODELS[0]).primary);

  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [isRunning, setIsRunning] = useState(false);

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
          const key = `${r.task_id}::${r.prompt_condition}`;
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

  function nextRunNumber(taskId: string, condition: PromptCondition): number {
    const key = `${taskId}::${condition}`;
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
    () => buildBatchJobs(tasks, selectedIds, conditionScope).length,
    [tasks, selectedIds, conditionScope]
  );

  // C4 — every run calls the test model AND both rotation judges, so preflight
  // must cover all three. Checking only the primary let a missing secondary key
  // fail mid-batch, after generation tokens were already spent.
  const keyStatuses = useKeyStatuses();
  const rotation = judgesFor(testModel);
  const requiredFamilies = useMemo(() => {
    const families = [
      familyOf(testModel),
      familyOf(rotation.primary),
      familyOf(rotation.secondary),
    ].filter((f): f is NonNullable<typeof f> => f !== null);
    return Array.from(new Set(families));
  }, [testModel, rotation.primary, rotation.secondary]);

  const keyBlocked =
    requiredFamilies.length < 3 || requiredFamilies.some((f) => !isFamilyReady(keyStatuses, f));

  async function runJob(task: TaskRecord, condition: PromptCondition, jobIndex: number) {
    function updateJob(patch: Partial<BatchJob>) {
      setJobs((prev) => prev.map((j, i) => (i === jobIndex ? { ...j, ...patch } : j)));
    }

    updateJob({ status: "running" });
    const prompt = condition === "baseline" ? task.baseline_prompt : task.craft_prompt;

    try {
      const runResponse = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: task.task_id,
          prompt,
          model: testModel,
          prompt_condition: condition,
          run_type: runType,
          temperature,
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
        model_name: testModel,
        model_provenance_fingerprint: runData.model_provenance_fingerprint,
        prompt_condition: condition,
        run_number: nextRunNumber(task.task_id, condition),
        run_type: runType,
        temperature,
        max_tokens: maxTokens,
        system_prompt: systemPrompt,
        run_settings_hash: runData.run_settings_hash,
        run_date: new Date(timestamp).toISOString(),
        raw_model_output: output,
        anonymized_output_id: anonymizedOutputId,
        truncated: Boolean(runData.truncated),
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
      const rotation = judgesFor(testModel);
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

  async function handleStartBatch() {
    if (keyBlocked) return;
    const newJobs = buildBatchJobs(tasks, selectedIds, conditionScope);
    if (newJobs.length === 0) return;

    setJobs(newJobs);
    setIsRunning(true);

    await runWithConcurrency(newJobs, CONCURRENCY_LIMIT, async (job, index) => {
      const task = tasks.find((t) => t.task_id === job.task_id);
      if (!task) {
        setJobs((prev) =>
          prev.map((j, i) =>
            i === index ? { ...j, status: "failed", error: "Task not found" } : j
          )
        );
        return;
      }
      await runJob(task, job.condition, index);
    });

    setIsRunning(false);
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

        <div className="flex items-center gap-4">
          {TEST_MODELS.map((id) => (
            <label key={id} className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="radio"
                checked={testModel === id}
                onChange={() => {
                  setTestModel(id);
                  // Snap the judge back to this model's rotation primary so a
                  // same-family judge can never remain selected.
                  setEvaluatorChoice(judgesFor(id).primary);
                }}
                disabled={isRunning}
              />
              {MODEL_LABEL[id]}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-heading mb-1">Temperature</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.1}
              value={temperature}
              disabled={isRunning}
              onChange={(e) => setTemperature(Number(e.target.value))}
              className="w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 disabled:opacity-50"
            />
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
          <div className="rounded-lg border border-cream-border bg-cream-card px-3 py-2 space-y-1">
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-navy-900 px-2 py-0.5 text-xs text-cream">
                primary
              </span>
              <span className="font-mono text-text-heading">
                {MODEL_LABEL[rotation.primary]}
              </span>
              <span className="text-xs text-text-muted">
                ({familyOf(rotation.primary)})
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-navy-100 px-2 py-0.5 text-xs text-navy-900">
                secondary
              </span>
              <span className="font-mono text-text-heading">
                {MODEL_LABEL[rotation.secondary]}
              </span>
              <span className="text-xs text-text-muted">
                ({familyOf(rotation.secondary)})
              </span>
            </div>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            Every run is scored by both judges. The rotation is derived from the producing model —{" "}
            {MODEL_LABEL[testModel]} — and is not selectable. A judge sharing the producing
            model&apos;s vendor family is rejected at the API layer.
            {isFamilyCollision(testModel, rotation.primary) ||
            isFamilyCollision(testModel, rotation.secondary) ? (
              <span className="text-error"> Rotation misconfigured: family collision.</span>
            ) : null}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold text-text-heading">Step 3 — Confirm and Run</h2>

        <Button
          onClick={handleStartBatch}
          disabled={isRunning || pendingJobCount === 0 || keyBlocked}
        >
          <Layers size={16} />
          {isRunning
            ? "Running batch…"
            : `Start Batch (${pendingJobCount} job${pendingJobCount === 1 ? "" : "s"})`}
        </Button>

        {jobs.length > 0 && <BatchJobList jobs={jobs} />}
      </section>
    </div>
  );
}
