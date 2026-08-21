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
import { runWithConcurrency } from "@/lib/concurrency";
import { generateEvaluationId, generateResultId } from "@/lib/anonymize";
import {
  buildBatchJobs,
  isTaskReadyForScope,
  type BatchJob,
  type ConditionScope,
} from "@/lib/batch";
import type { EvaluationRecord, PromptCondition, ResultRecord, TaskRecord } from "@/types";

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
  const [conditionScope, setConditionScope] = useState<ConditionScope>("both");
  const [testModel, setTestModel] = useState<TestModel>(TEST_MODELS[0]);
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(2000);
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
  const selectedIds = useMemo(() => {
    const next = new Set<string>();
    for (const id of rawSelectedIds) {
      const task = tasks.find((t) => t.task_id === id);
      if (task && isTaskReadyForScope(task, conditionScope)) next.add(id);
    }
    return next;
  }, [rawSelectedIds, tasks, conditionScope]);

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

  const keyStatuses = useKeyStatuses();
  const testModelFamily = familyOf(testModel);
  const evaluatorFamily = familyOf(evaluatorChoice);
  const keyBlocked =
    !testModelFamily ||
    !evaluatorFamily ||
    !isFamilyReady(keyStatuses, testModelFamily) ||
    !isFamilyReady(keyStatuses, evaluatorFamily);

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
        run_type: "benchmark",
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
        <div className="flex items-center gap-4">
          {(["baseline", "craft", "both"] as ConditionScope[]).map((scope) => (
            <label key={scope} className="flex items-center gap-2 text-sm text-text-body capitalize">
              <input
                type="radio"
                checked={conditionScope === scope}
                onChange={() => setConditionScope(scope)}
                disabled={isRunning}
              />
              {scope}
            </label>
          ))}
        </div>

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

        <div>
          <label className="block text-sm font-medium text-text-heading mb-1">Evaluator Model</label>
          <Select
            value={evaluatorChoice}
            disabled={isRunning}
            onChange={(e) => setEvaluatorChoice(e.target.value as BatchEvaluator)}
          >
            {[judgesFor(testModel).primary, judgesFor(testModel).secondary]
              .filter((judge) => !isFamilyCollision(testModel, judge))
              .map((id) => (
                <option key={id} value={id}>
                  {MODEL_LABEL[id]}
                  {id === judgesFor(testModel).primary ? " — primary" : " — secondary"}
                </option>
              ))}
          </Select>
          <p className="mt-1 text-xs text-text-muted">
            Every run in this batch is evaluated automatically with the same evaluator, and saved
            only if both the run and the evaluation succeed. Judges are fixed by rotation for{" "}
            {MODEL_LABEL[testModel]}; a judge sharing the producing model&apos;s vendor family is
            never offered and is rejected at the API layer.
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
