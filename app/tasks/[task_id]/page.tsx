"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TaskForm } from "@/components/tasks/TaskForm";
import { CRAFTMeter } from "@/components/craft/CRAFTMeter";
import { Button } from "@/components/ui/Button";
import { changedVersionedFields, versionedFieldsEqual } from "@/lib/taskVersion";
import { joinResults } from "@/lib/resultsJoin";
import type { EvaluationRecord, ResultRecord, TaskRecord } from "@/types";

const fmt = (v: number | null) => (v === null ? "-" : Math.round(v * 100) / 100);

export default function TaskDetailPage() {
  const params = useParams<{ task_id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  // The task as last loaded/saved — the baseline for detecting whether a save
  // would change the content hash.
  const [baseline, setBaseline] = useState<TaskRecord | null>(null);
  const [pendingInvalidation, setPendingInvalidation] = useState<string[] | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()) as Promise<TaskRecord[]>,
      fetch("/api/results").then((r) => r.json()) as Promise<ResultRecord[]>,
      fetch("/api/evaluations").then((r) => r.json()) as Promise<EvaluationRecord[]>,
    ])
      .then(([tasks, allResults, allEvaluations]) => {
        const found = tasks.find((t) => t.task_id === params.task_id) ?? null;
        setTask(found);
        setBaseline(found);
        setResults(allResults.filter((r) => r.task_id === params.task_id));
        setEvaluations(allEvaluations);
      })
      .catch(() => setLoadError("Failed to load this task. Try refreshing the page."))
      .finally(() => setLoading(false));
  }, [params.task_id]);

  // 4c — a save that changes the content hash invalidates every recorded run
  // for this task. Only prompt when the hash would actually move AND runs exist.
  function requestSave() {
    if (!task || !baseline) return;
    const hashChanges = !versionedFieldsEqual(baseline, task);
    if (hashChanges && results.length > 0) {
      setPendingInvalidation(changedVersionedFields(baseline, task));
      return;
    }
    void handleSave();
  }

  async function handleSave() {
    if (!task) return;
    setPendingInvalidation(null);
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    setValidationErrors([]);
    try {
      const response = await fetch(`/api/tasks/${task.task_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
      const data = await response.json();

      if (!response.ok) {
        setSaveError(data.error ?? `Save failed (HTTP ${response.status}).`);
        setValidationErrors(Array.isArray(data.errors) ? data.errors : []);
        return;
      }

      // Adopt the server's canonical record — craft_prompt is re-derived and
      // fields are trimmed server-side, so the editor must reflect that.
      setTask(data);
      setBaseline(data);
      setSaved(true);
    } catch {
      setSaveError("Could not reach the server. Your changes were not saved.");
    } finally {
      setSaving(false);
    }
  }

  const scoredResults = joinResults(results, evaluations);

  if (loading) {
    return <p className="text-sm text-text-muted">Loading task…</p>;
  }

  if (loadError) {
    return <p className="text-sm text-error">{loadError}</p>;
  }

  if (!task) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-muted">Task not found.</p>
        <Button variant="secondary" onClick={() => router.push("/tasks")}>
          <ArrowLeft size={16} /> Back to Task Library
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => router.push("/tasks")}
        className="inline-flex items-center gap-1 text-sm text-navy-700 hover:text-navy-900"
      >
        <ArrowLeft size={16} /> Back to Task Library
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[60%_40%] gap-8">
        <div>
          <TaskForm
            task={task}
            onChange={(next) => {
              setTask(next);
              setSaved(false);
              setSaveError(null);
              setValidationErrors([]);
              setPendingInvalidation(null);
            }}
          />
          <div className="mt-6 space-y-3">
            <div className="flex items-center gap-3">
              <Button onClick={requestSave} disabled={saving || pendingInvalidation !== null}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              {saved && <span className="text-sm text-success">Saved</span>}
            </div>

            {pendingInvalidation && (
              <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3 space-y-2">
                <p className="text-sm font-semibold text-error">
                  This change will invalidate {results.length} recorded run
                  {results.length === 1 ? "" : "s"} for {task.task_id}
                </p>
                <p className="text-xs text-error/90">
                  You edited scoring-relevant content, so the task&apos;s content hash changes.
                  Runs already recorded were produced against the previous content and will no
                  longer be comparable — they must be re-run or excluded from analysis.
                </p>
                <p className="text-xs text-error/90">
                  Changed:{" "}
                  <span className="font-mono">{pendingInvalidation.join(", ")}</span>
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving
                      ? "Saving…"
                      : `Save and invalidate ${results.length} run${results.length === 1 ? "" : "s"}`}
                  </Button>
                  <Button variant="secondary" onClick={() => setPendingInvalidation(null)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {saveError && (
              <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3">
                <p className="text-sm font-semibold text-error">{saveError}</p>
                {validationErrors.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-xs text-error/90">
                    {validationErrors.map((err) => (
                      <li key={err}>{err}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-error/80">
                  Nothing was written — fix the fields above and save again.
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold text-text-heading mb-2">
              CRAFT Completeness Meter
            </h3>
            <CRAFTMeter craftPromptText={task.craft_prompt} />
          </div>

          {results.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-text-heading mb-2">Existing Results</h3>
              <div className="overflow-x-auto rounded-lg border border-cream-border">
                <table className="w-full text-xs">
                  <thead className="bg-cream-card text-text-muted">
                    <tr>
                      <th className="text-left px-3 py-2">Model</th>
                      <th className="text-left px-3 py-2">Condition</th>
                      <th className="text-left px-3 py-2">Run #</th>
                      <th className="text-left px-3 py-2">Judges</th>
                      <th className="text-left px-3 py-2">Constraint</th>
                      <th className="text-left px-3 py-2">Logic</th>
                      <th className="text-left px-3 py-2">Complete</th>
                      <th className="text-left px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scoredResults.map((s) => (
                      <tr
                        key={s.result.result_id}
                        className="border-t border-cream-border font-mono"
                      >
                        <td className="px-3 py-2">{s.result.model_name}</td>
                        <td className="px-3 py-2">{s.result.prompt_condition}</td>
                        <td className="px-3 py-2">{s.result.run_number}</td>
                        <td className="px-3 py-2">
                          {s.evaluations.length}/2
                          {s.result.truncated && (
                            <span className="ml-1 text-error" title="Output hit the token limit">
                              trunc
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">{fmt(s.primaryConstraint)}/4</td>
                        <td className="px-3 py-2">{fmt(s.primaryLogical)}/4</td>
                        <td className="px-3 py-2">{fmt(s.primaryCompleteness)}/2</td>
                        <td className="px-3 py-2 font-semibold">{fmt(s.primaryTotal)}/10</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
