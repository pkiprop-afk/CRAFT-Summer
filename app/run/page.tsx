"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { PromptRunner, type TestModel } from "@/components/runner/PromptRunner";
import { EvaluationPanel, type EvaluatorChoice } from "@/components/runner/EvaluationPanel";
import { ApiKeyBanner, isFamilyReady, useKeyStatuses } from "@/components/ui/ApiKeyBanner";
import { familyOf } from "@/lib/models/registry";
import { generateOutputId, generateResultId } from "@/lib/anonymize";
import { parseEvaluatorResponse, type ParsedEvaluation } from "@/lib/evaluator";
import type { PromptCondition, ResultRecord, TaskRecord } from "@/types";

export default function PromptRunnerPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState("");
  const [condition, setCondition] = useState<PromptCondition>("baseline");
  const [testModel, setTestModel] = useState<TestModel>("claude-3-5-sonnet");
  const [temperature, setTemperature] = useState(0.2);
  const [maxTokens, setMaxTokens] = useState(2000);
  const [systemPrompt, setSystemPrompt] = useState("You are a helpful assistant.");

  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string | null>(null);
  const [anonymizedOutputId, setAnonymizedOutputId] = useState<string | null>(null);
  const [runTimestamp, setRunTimestamp] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [evaluatorChoice, setEvaluatorChoice] = useState<EvaluatorChoice>("gemini-1.5-pro");
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<ParsedEvaluation | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [manualPasteText, setManualPasteText] = useState("");

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
    return condition === "baseline" ? selectedTask.baseline_prompt : selectedTask.craft_prompt;
  }, [selectedTask, condition]);

  function resetRunState() {
    setOutput(null);
    setAnonymizedOutputId(null);
    setRunTimestamp(null);
    setRunError(null);
    setEvaluation(null);
    setEvaluationError(null);
    setManualPasteText("");
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
          prompt: selectedPromptText,
          model: testModel,
          temperature,
          max_tokens: maxTokens,
          system_prompt: systemPrompt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Run failed");

      const timestamp = Date.now();
      setOutput(data.output);
      setAnonymizedOutputId(generateOutputId(selectedTask.task_id, condition, testModel, timestamp));
      setRunTimestamp(new Date(timestamp).toISOString());
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
      });
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : "Evaluation failed");
    } finally {
      setEvaluating(false);
    }
  }

  function handleManualParse() {
    const parsed = parseEvaluatorResponse(manualPasteText);
    if (!parsed) {
      setEvaluationError("Could not parse the pasted Manus output. Check the format.");
      return;
    }
    setEvaluationError(null);
    setEvaluation(parsed);
  }

  async function handleSave() {
    if (!selectedTask || !output || !anonymizedOutputId || !runTimestamp) return;
    setSaving(true);
    setSaveError(null);
    const runNumber =
      results.filter(
        (r) => r.task_id === selectedTask.task_id && r.prompt_condition === condition
      ).length + 1;
    const result: ResultRecord = {
      result_id: generateResultId(),
      task_id: selectedTask.task_id,
      // Frozen at run time — staleness is detected by comparing this against
      // the task's current version.
      task_version: selectedTask.task_version,
      model_name: testModel,
      prompt_condition: condition,
      run_number: runNumber,
      temperature,
      run_date: runTimestamp,
      raw_model_output: output,
      anonymized_output_id: anonymizedOutputId,
      constraint_adherence_score_0_4: evaluation?.constraint_adherence ?? 0,
      logical_accuracy_score_0_4: evaluation?.logical_accuracy ?? 0,
      completeness_score_0_2: evaluation?.completeness ?? 0,
      total_score_0_10: evaluation?.total ?? 0,
      evaluator_model: evaluation ? evaluatorChoice : "none",
      evaluator_justification: evaluation?.justification ?? "",
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
      setSaved(true);
    } catch {
      setSaveError("Failed to save the result. Try again.");
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
        onSelectTestModel={setTestModel}
        temperature={temperature}
        onTemperatureChange={setTemperature}
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
            evaluatorChoice={evaluatorChoice}
            onEvaluatorChoiceChange={setEvaluatorChoice}
            onEvaluate={handleEvaluate}
            evaluating={evaluating}
            evaluation={evaluation}
            evaluationError={evaluationError}
            manualPasteText={manualPasteText}
            onManualPasteChange={setManualPasteText}
            onManualParse={handleManualParse}
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
