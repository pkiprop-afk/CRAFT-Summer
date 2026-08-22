"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { PromptRunner, type TestModel } from "@/components/runner/PromptRunner";
import { EvaluationPanel, type EvaluatorChoice } from "@/components/runner/EvaluationPanel";
import { ApiKeyBanner, isFamilyReady, useKeyStatuses } from "@/components/ui/ApiKeyBanner";
import { familyOf, judgesFor, TEST_MODELS } from "@/lib/models/registry";
import { generateEvaluationId, generateResultId } from "@/lib/anonymize";
import { DEFAULT_MAX_TOKENS } from "@/lib/runSettings";
import { claimRunNumber, seedRunNumberCounts, type RunNumberScope } from "@/lib/runNumber";
import type { DecodingParams } from "@/lib/decoding";
import type { RetryAttempt } from "@/lib/retry";
import { composedPromptFor } from "@/lib/promptAssembly";
import { type ParsedEvaluation } from "@/lib/evaluator";
import type {
  EvaluationRecord,
  PromptCondition,
  ResultRecord,
  RunType,
  TaskRecord,
} from "@/types";

export default function PromptRunnerPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [condition, setCondition] = useState<PromptCondition>("baseline");
  const [testModel, setTestModel] = useState<TestModel>(TEST_MODELS[0]);
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");
  // Single-run page is for smoke tests; main-study runs go through the batch runner.
  const [runType] = useState<RunType>("main");

  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [anonymizedOutputId, setAnonymizedOutputId] = useState<string | null>(null);
  const [runTimestamp, setRunTimestamp] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runMeta, setRunMeta] = useState<{
    model_provenance_fingerprint: string;
    run_settings_hash: string;
    run_settings_fields: string[];
    decoding_params: DecodingParams;
    truncated: boolean;
    reasoning_tokens: number | null;
    retry_count: number;
    retry_log: RetryAttempt[];
  } | null>(null);
  const [evaluatorProvenance, setEvaluatorProvenance] = useState("");

  const [evaluatorChoice, setEvaluatorChoice] = useState<EvaluatorChoice>(judgesFor(TEST_MODELS[0]).primary);
  const [evaluating, setEvaluating] = useState(false);
  // K1 — the judge's parsed scores plus the transport metadata for that call.
  // The retry fields are not part of what the judge said, so they are carried
  // alongside ParsedEvaluation rather than folded into it.
  const [evaluation, setEvaluation] = useState<
    (ParsedEvaluation & { retry_count: number; retry_log: RetryAttempt[] }) | null
  >(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [tasksLoadError, setTasksLoadError] = useState<string | null>(null);

  const keyStatuses = useKeyStatuses();
  const testModelFamily = familyOf(testModel);
  const testModelKeyReady = testModelFamily ? isFamilyReady(keyStatuses, testModelFamily) : false;

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks)
      .catch(() => setTasksLoadError("Failed to load tasks. Try refreshing the page."));
    fetch("/api/results")
      .then((r) => r.json())
      .then(setResults)
      .catch(() => {});
  }, []);

  const selectedTask = useMemo(
    () => tasks.find((t) => t.task_id === selectedTaskId),
    [tasks, selectedTaskId]
  );

  const selectedPromptText = useMemo(() => {
    if (!selectedTask) return "";
    // Preview exactly what the server will send, stimulus block included.
    return composedPromptFor(selectedTask, condition);
  }, [selectedTask, condition]);

  function resetRunState() {
    setOutput(null);
    setAnonymizedOutputId(null);
    setRunTimestamp(null);
    setRunMeta(null);
    setEvaluatorProvenance("");
    setRunError(null);
    setEvaluation(null);
    setEvaluationError(null);
    setSaved(false);
    setSaveError(null);
  }

  async function handleRun() {
    if (!selectedTask || !selectedPromptText) return;
    if (!selectedTask.baseline_prompt || !selectedTask.craft_prompt) return;
    if (!testModelKeyReady) return;
    resetRunState();
    setRunning(true);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: selectedTask.task_id,
          model: testModel,
          prompt_condition: condition,
          run_type: runType,
          max_tokens: maxTokens,
          system_prompt: systemPrompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Run failed");

      setOutput(data.output);
      // The blinding token is allocated server-side and is opaque.
      setAnonymizedOutputId(data.anonymized_output_id);
      setRunMeta({
        model_provenance_fingerprint: data.model_provenance_fingerprint,
        run_settings_hash: data.run_settings_hash,
        run_settings_fields: data.run_settings_fields,
        decoding_params: data.decoding_params,
        truncated: Boolean(data.truncated),
        reasoning_tokens: data.reasoning_tokens ?? null,
        retry_count: data.retry_count ?? 0,
        retry_log: data.retry_log ?? [],
      });
      setRunTimestamp(new Date().toISOString());
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  async function handleEvaluate() {
    if (!selectedTask || !output) return;
    setEvaluating(true);
    setEvaluationError(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // The producing model is derived server-side from this token.
          anonymized_output_id: anonymizedOutputId,
          task_description: selectedTask.task_description,
          expected_constraints: selectedTask.expected_constraints,
          rubric_notes: selectedTask.rubric_notes,
          model_response: output,
          evaluator: evaluatorChoice,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Evaluation failed");
      setEvaluation({
        constraint_adherence: data.constraint_adherence,
        logical_accuracy: data.logical_accuracy,
        completeness: data.completeness,
        total: data.total,
        justification: data.justification,
        retry_count: data.evaluator_retry_count ?? 0,
        retry_log: data.evaluator_retry_log ?? [],
      });
      setEvaluatorProvenance(data.evaluator_provenance_fingerprint ?? "");
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  async function handleSave() {
    if (!selectedTask || !output || !anonymizedOutputId || !runTimestamp || !runMeta) return;
    setSaving(true);
    setSaveError(null);
    // F1 — sequences are per run_type: main is always 1 (n=1), stability 1..3.
    // Scoped per CELL, model included — see lib/runNumber.ts.
    const scope: RunNumberScope = {
      task_id: selectedTask.task_id,
      model_name: testModel,
      prompt_condition: condition,
      run_type: runType,
    };
    const runNumber = claimRunNumber(seedRunNumberCounts(results), scope);

    const result: ResultRecord = {
      result_id: generateResultId(),
      task_id: selectedTask.task_id,
      // Frozen at run time — staleness is detected by comparing this against
      // the task's current version.
      task_version: selectedTask.task_version,
      model_name: testModel,
      model_provenance_fingerprint: runMeta.model_provenance_fingerprint,
      prompt_condition: condition,
      run_number: runNumber,
      run_type: runType,
      decoding_params: runMeta.decoding_params,
      max_tokens: maxTokens,
      system_prompt: systemPrompt,
      run_settings_hash: runMeta.run_settings_hash,
      run_settings_fields: runMeta.run_settings_fields,
      run_date: runTimestamp,
      raw_model_output: output,
      anonymized_output_id: anonymizedOutputId,
      truncated: runMeta.truncated,
      reasoning_tokens: runMeta.reasoning_tokens,
      retry_count: runMeta.retry_count,
      retry_log: runMeta.retry_log,
      notes: "",
    };

    try {
      const response = await fetch("/api/results", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result),
      });
      if (!response.ok) throw new Error("Save request failed");
      setResults((prev) => [...prev, result]);

      // Scores are a separate record keyed by result_id. A run saved without an
      // evaluation simply has none — it is an incomplete cell, never a zero.
      if (evaluation) {
        const evalRecord: EvaluationRecord = {
          evaluation_id: generateEvaluationId(),
          result_id: result.result_id,
          evaluator_model: evaluatorChoice as string,
          evaluator_provenance_fingerprint: evaluatorProvenance,
          is_primary: evaluatorChoice === judgesFor(testModel).primary,
          evaluated_at: new Date().toISOString(),
          constraint_adherence_score_0_4: evaluation.constraint_adherence,
          logical_accuracy_score_0_4: evaluation.logical_accuracy,
          completeness_score_0_2: evaluation.completeness,
          total_score_0_10: evaluation.total,
          retry_count: evaluation.retry_count,
          retry_log: evaluation.retry_log,
          evaluator_justification: evaluation.justification,
        };
        const evalResponse = await fetch("/api/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(evalRecord),
        });
        if (!evalResponse.ok) {
          const data = await evalResponse.json();
          throw new Error(data.error ?? "Evaluation save failed");
        }
      }

      setSaved(true);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save the result. Try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-display font-bold text-text-heading">Prompt Runner</h1>

      {tasksLoadError && <p className="text-sm text-error">{tasksLoadError}</p>}

      <ApiKeyBanner statuses={keyStatuses} families={["anthropic", "openai"]} />

      <PromptRunner
        tasks={tasks}
        selectedTaskId={selectedTaskId}
        onSelectTask={(id) => {
          setSelectedTaskId(id);
          resetRunState();
        }}
        condition={condition}
        onSelectCondition={(c) => {
          setCondition(c);
          resetRunState();
        }}
        selectedTask={selectedTask}
        selectedPromptText={selectedPromptText}
        testModel={testModel}
        onSelectTestModel={(model) => {
          setTestModel(model);
          // Judges are model-dependent; snap back to the rotation primary so a
          // now-illegal same-family judge can never stay selected.
          setEvaluatorChoice(judgesFor(model).primary);
          resetRunState();
        }}
        maxTokens={maxTokens}
        onMaxTokensChange={setMaxTokens}
        systemPrompt={systemPrompt}
        onSystemPromptChange={setSystemPrompt}
        onRun={handleRun}
        running={running}
        keyBlocked={!testModelKeyReady}
      />

      {runError && <p className="text-sm text-error">{runError}</p>}

      {output && anonymizedOutputId && (
        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-text-heading">Step 3 — Output and Evaluation</h2>

          <div>
            <span className="inline-block rounded-full bg-navy-100 text-navy-900 font-mono text-xs px-3 py-1 mb-2">
              {anonymizedOutputId}
            </span>
            <div className="relative">
              <pre className="rounded-lg bg-white border border-cream-border px-4 py-3 text-sm font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">
                {output}
              </pre>
              <button
                onClick={() => navigator.clipboard.writeText(output)}
                className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-cream-card border border-cream-border px-2 py-1 text-xs text-text-body hover:bg-navy-100"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
          </div>

          <EvaluationPanel
            anonymizedOutputId={anonymizedOutputId}
            producingModel={testModel}
            evaluatorChoice={evaluatorChoice}
            onEvaluatorChoiceChange={setEvaluatorChoice}
            onEvaluate={handleEvaluate}
            evaluating={evaluating}
            evaluation={evaluation}
            evaluationError={evaluationError}
            onSave={handleSave}
            saving={saving}
            saved={saved}
            saveError={saveError}
            canSave={Boolean(output)}
          />
        </section>
      )}
    </div>
  );
}
