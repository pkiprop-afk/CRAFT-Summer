"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { PromptRunner, type TestModel } from "@/components/runner/PromptRunner";
import { EvaluationPanel, type EvaluatorChoice } from "@/components/runner/EvaluationPanel";
import { generateOutputId, generateResultId } from "@/lib/anonymize";
import { parseEvaluatorResponse, type ParsedEvaluation } from "@/lib/evaluator";
import type { PromptCondition, ResultRecord, TaskRecord } from "@/types";

export default function PromptRunnerPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
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

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks);
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
  }

  async function handleRun() {
    if (!selectedTask || !selectedPromptText) return;
    resetRunState();
    setRunning(true);
    try {
      const response = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
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
    const result: ResultRecord = {
      result_id: generateResultId(),
      task_id: selectedTask.task_id,
      test_model: testModel,
      prompt_condition: condition,
      anonymized_output_id: anonymizedOutputId,
      raw_output: output,
      constraint_adherence: evaluation?.constraint_adherence ?? 0,
      logical_accuracy: evaluation?.logical_accuracy ?? 0,
      completeness: evaluation?.completeness ?? 0,
      total_score: evaluation?.total ?? 0,
      justification: evaluation?.justification ?? "",
      evaluator_model: evaluation ? evaluatorChoice : "none",
      temperature,
      run_timestamp: runTimestamp,
    };
    await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(result),
    });
    setSaving(false);
    setSaved(true);
  }

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-display font-bold text-text-heading">Prompt Runner</h1>

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
            canSave={Boolean(output)}
          />
        </section>
      )}
    </div>
  );
}
