"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { computeTaskProgress, type TaskProgressRow } from "@/lib/progress";
import { DOMAIN_LABELS, type ResultRecord, type TaskRecord } from "@/types";

function StatusIndicator({ done }: { done: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
        done ? "bg-success text-white" : "bg-cream-border text-text-muted"
      }`}
    >
      {done ? <Check size={14} /> : <X size={14} />}
    </span>
  );
}

function SummaryStat({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <Card accentColor="var(--color-navy-700)">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-display font-bold text-text-heading">
        {value}/{total}
      </p>
    </Card>
  );
}

export default function ProgressPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()) as Promise<TaskRecord[]>,
      fetch("/api/results").then((r) => r.json()) as Promise<ResultRecord[]>,
    ])
      .then(([taskData, resultData]) => {
        setTasks(taskData);
        setResults(resultData);
      })
      .catch(() => setLoadError("Failed to load progress data. Try refreshing the page."))
      .finally(() => setLoading(false));
  }, []);

  const rows: TaskProgressRow[] = useMemo(
    () => computeTaskProgress(tasks, results),
    [tasks, results]
  );

  const total = rows.length;
  const definedCount = rows.filter((r) => r.taskDefined).length;
  const runReadyCount = rows.filter(
    (r) => r.baselinePromptAuthored && r.craftPromptAuthored
  ).length;
  const baselineRunCount = rows.filter((r) => r.baselineRunComplete).length;
  const craftRunCount = rows.filter((r) => r.craftRunComplete).length;
  const staleRunCount = rows.reduce((sum, r) => sum + r.staleRuns, 0);
  const tasksWithStaleRuns = rows.filter((r) => r.staleRuns > 0).length;

  if (loading) {
    return <p className="text-sm text-text-muted">Loading progress…</p>;
  }

  if (loadError) {
    return <p className="text-sm text-error">{loadError}</p>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-text-heading">Progress</h1>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <SummaryStat label="Tasks Defined" value={definedCount} total={total} />
        <SummaryStat label="Run-Ready" value={runReadyCount} total={total} />
        <SummaryStat label="Baseline Prompts" value={rows.filter((r) => r.baselinePromptAuthored).length} total={total} />
        <SummaryStat label="CRAFT Prompts" value={rows.filter((r) => r.craftPromptAuthored).length} total={total} />
        <SummaryStat
          label="Both Runs Complete"
          value={rows.filter((r) => r.baselineRunComplete && r.craftRunComplete).length}
          total={total}
        />
      </div>

      <p className="text-sm text-text-muted">
        {runReadyCount}/{total} tasks run-ready · {baselineRunCount}/{total} baseline runs
        complete · {craftRunCount}/{total} CRAFT runs complete
      </p>

      {staleRunCount > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3">
          <p className="text-sm font-semibold text-warning">
            {staleRunCount} stale run{staleRunCount === 1 ? "" : "s"} across {tasksWithStaleRuns}{" "}
            task{tasksWithStaleRuns === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-warning/90">
            These runs were recorded against an earlier version of the task content. They are not
            comparable with current runs and must be re-run or excluded from analysis.
          </p>
        </div>
      )}

      {total === 0 ? (
        <p className="text-sm text-text-muted">No tasks yet. Add tasks from the Task Library.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-cream-border">
          <table className="w-full text-sm">
            <thead className="bg-cream-card text-text-muted">
              <tr>
                <th className="text-left px-3 py-2">Task</th>
                <th className="text-left px-3 py-2">Domain</th>
                <th className="text-center px-3 py-2">Task Defined</th>
                <th className="text-center px-3 py-2">Baseline Prompt</th>
                <th className="text-center px-3 py-2">CRAFT Prompt</th>
                <th className="text-center px-3 py-2">Baseline Run</th>
                <th className="text-center px-3 py-2">CRAFT Run</th>
                <th className="text-center px-3 py-2">Stale</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.task_id} className="border-t border-cream-border">
                  <td className="px-3 py-2">
                    <Link
                      href={`/tasks/${row.task_id}`}
                      className="font-mono text-xs text-navy-700 hover:text-navy-900"
                    >
                      {row.task_id}
                    </Link>
                    <p className="text-xs text-text-muted line-clamp-2 max-w-xs">
                      {row.task_description}
                    </p>
                  </td>
                  <td className="px-3 py-2 text-text-body">{DOMAIN_LABELS[row.domain]}</td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <StatusIndicator done={row.taskDefined} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <StatusIndicator done={row.baselinePromptAuthored} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <StatusIndicator done={row.craftPromptAuthored} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <StatusIndicator done={row.baselineRunComplete} />
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-center">
                      <StatusIndicator done={row.craftRunComplete} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    {row.staleRuns > 0 ? (
                      <span
                        className="inline-block rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-warning"
                        title="Runs recorded against an earlier version of this task"
                      >
                        {row.staleRuns}
                      </span>
                    ) : (
                      <span className="text-xs text-text-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
