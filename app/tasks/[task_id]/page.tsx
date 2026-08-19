"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TaskForm } from "@/components/tasks/TaskForm";
import { CRAFTMeter } from "@/components/craft/CRAFTMeter";
import { Button } from "@/components/ui/Button";
import type { ResultRecord, TaskRecord } from "@/types";

export default function TaskDetailPage() {
  const params = useParams<{ task_id: string }>();
  const router = useRouter();
  const [task, setTask] = useState<TaskRecord | null>(null);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()) as Promise<TaskRecord[]>,
      fetch("/api/results").then((r) => r.json()) as Promise<ResultRecord[]>,
    ])
      .then(([tasks, allResults]) => {
        setTask(tasks.find((t) => t.task_id === params.task_id) ?? null);
        setResults(allResults.filter((r) => r.task_id === params.task_id));
      })
      .catch(() => setLoadError("Failed to load this task. Try refreshing the page."))
      .finally(() => setLoading(false));
  }, [params.task_id]);

  async function handleSave() {
    if (!task) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const response = await fetch(`/api/tasks/${task.task_id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(task),
      });
      if (!response.ok) throw new Error("Save request failed");
      setSaved(true);
    } catch {
      setSaveError("Failed to save changes. Try again.");
    } finally {
      setSaving(false);
    }
  }

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
          <TaskForm task={task} onChange={setTask} />
          <div className="mt-6 flex items-center gap-3">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Button>
            {saved && <span className="text-sm text-success">Saved</span>}
            {saveError && <span className="text-sm text-error">{saveError}</span>}
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
                      <th className="text-left px-3 py-2">Constraint</th>
                      <th className="text-left px-3 py-2">Logic</th>
                      <th className="text-left px-3 py-2">Complete</th>
                      <th className="text-left px-3 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.anonymized_output_id} className="border-t border-cream-border font-mono">
                        <td className="px-3 py-2">{r.model_name}</td>
                        <td className="px-3 py-2">{r.prompt_condition}</td>
                        <td className="px-3 py-2">{r.constraint_adherence_score_0_4}/4</td>
                        <td className="px-3 py-2">{r.logical_accuracy_score_0_4}/4</td>
                        <td className="px-3 py-2">{r.completeness_score_0_2}/2</td>
                        <td className="px-3 py-2 font-semibold">{r.total_score_0_10}/10</td>
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
