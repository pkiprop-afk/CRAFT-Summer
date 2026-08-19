"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { TaskCard } from "@/components/tasks/TaskCard";
import { Button } from "@/components/ui/Button";
import type { TaskImportError } from "@/lib/taskImport";
import { DOMAIN_LABELS, type Domain, type ResultRecord, type TaskRecord } from "@/types";

const DOMAIN_TABS: Array<{ label: string; value: Domain | "all" }> = [
  { label: "All", value: "all" },
  { label: "Coding", value: "coding" },
  { label: "Data Analysis", value: "data_analysis" },
  { label: "Finance", value: "finance" },
  { label: "Policy", value: "policy" },
  { label: "Education", value: "education" },
  { label: "Communication", value: "communication" },
];

interface ImportReport {
  importedCount: number;
  rejectedCount: number;
  totalRows: number;
  errors: TaskImportError[];
}

export default function TaskLibraryPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);
  const [activeDomain, setActiveDomain] = useState<Domain | "all">("all");
  const [search, setSearch] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/results").then((r) => r.json()),
    ])
      .then(([taskData, resultData]) => {
        setTasks(taskData);
        setResults(resultData);
      })
      .catch(() => setLoadError("Failed to load tasks. Try refreshing the page."))
      .finally(() => setLoading(false));
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesDomain = activeDomain === "all" || task.domain === activeDomain;
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query.length === 0 ||
        task.task_id.toLowerCase().includes(query) ||
        task.task_description.toLowerCase().includes(query);
      return matchesDomain && matchesSearch;
    });
  }, [tasks, activeDomain, search]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportReport(null);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/tasks/import", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        setImportError(data.error ?? "Import failed.");
        if (typeof data.importedCount === "number") {
          setImportReport({
            importedCount: data.importedCount,
            rejectedCount: data.rejectedCount,
            totalRows: data.totalRows,
            errors: data.errors ?? [],
          });
        }
        return;
      }

      setTasks(data.tasks);
      setImportReport({
        importedCount: data.importedCount,
        rejectedCount: data.rejectedCount,
        totalRows: data.totalRows,
        errors: data.errors,
      });
    } catch {
      setImportError("Could not reach the import endpoint. Try again.");
    } finally {
      e.target.value = "";
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-text-heading">Task Library</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted">{filteredTasks.length} tasks</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={handleImport}
          />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload size={16} />
            Import
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {DOMAIN_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveDomain(tab.value)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                activeDomain === tab.value
                  ? "bg-navy-900 text-cream"
                  : "bg-cream-card text-text-body hover:bg-navy-100"
              }`}
            >
              {tab.value === "all" ? "All" : DOMAIN_LABELS[tab.value]}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tasks..."
          className="w-64 rounded-lg border border-cream-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"
        />
      </div>

      {importError && <p className="text-sm text-error">{importError}</p>}

      {importReport && (
        <div className="rounded-lg border border-cream-border bg-cream-card px-4 py-3 text-sm space-y-2">
          <p className="font-medium text-text-heading">
            Import: {importReport.importedCount} imported, {importReport.rejectedCount} rejected
            (of {importReport.totalRows} rows)
          </p>
          {importReport.errors.length > 0 && (
            <ul className="space-y-1 text-xs text-text-muted max-h-48 overflow-y-auto font-mono">
              {importReport.errors.map((err) => (
                <li key={err.row}>
                  Row {err.row} ({err.task_id}): {err.reasons.join("; ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-muted">Loading tasks…</p>
      ) : loadError ? (
        <p className="text-sm text-error">{loadError}</p>
      ) : filteredTasks.length === 0 ? (
        <p className="text-sm text-text-muted">No tasks match the current filter.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredTasks.map((task) => {
            const taskResults = results.filter((r) => r.task_id === task.task_id);
            return (
              <TaskCard
                key={task.task_id}
                task={task}
                hasResults={taskResults.length > 0}
                hasScores={taskResults.some((r) => Boolean(r.evaluator_justification))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
