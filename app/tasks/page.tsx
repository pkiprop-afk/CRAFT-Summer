"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { TaskCard } from "@/components/tasks/TaskCard";
import { ImportDiffPreview, type ImportPreview } from "@/components/tasks/ImportDiffPreview";
import { Button } from "@/components/ui/Button";
import type { ImportMode } from "@/lib/taskDiff";
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

export default function TaskLibraryPage() {
  const [tasks, setTasks] = useState<TaskRecord[]>([]);
  const [results, setResults] = useState<ResultRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [importSummary, setImportSummary] = useState<string | null>(null);
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

  function toPreview(data: Record<string, unknown>): ImportPreview {
    return {
      mode: data.mode as ImportMode,
      sheetName: (data.sheetName as string | null) ?? null,
      availableSheets: (data.availableSheets as string[]) ?? [],
      totalRows: data.totalRows as number,
      importedCount: data.importedCount as number,
      rejectedCount: data.rejectedCount as number,
      errors: (data.errors as ImportPreview["errors"]) ?? [],
      headerNormalizations: (data.headerNormalizations as ImportPreview["headerNormalizations"]) ?? [],
      domainMappedCount: (data.domainMappedCount as number) ?? 0,
      constraintReports: (data.constraintReports as ImportPreview["constraintReports"]) ?? [],
      constraintFlaggedCount: (data.constraintFlaggedCount as number) ?? 0,
      ignoredCraftPromptRows: (data.ignoredCraftPromptRows as string[]) ?? [],
      diff: data.diff as ImportPreview["diff"],
      existingCount: (data.existingCount as number) ?? 0,
      resultingCount: (data.resultingCount as number) ?? 0,
    };
  }

  // Step 1 — always a dry run. No file selection can write to the store.
  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportError(null);
    setImportSummary(null);
    setPreview(null);
    setPendingFile(null);
    setPreviewing(true);

    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(
        `/api/tasks/import?dryRun=true&mode=${importMode}`,
        { method: "POST", body }
      );
      const data = await response.json();

      if (!response.ok) {
        setImportError(data.error ?? "Could not read that file.");
        return;
      }

      setPreview(toPreview(data));
      setPendingFile(file);
    } catch {
      setImportError("Could not reach the import endpoint. Try again.");
    } finally {
      setPreviewing(false);
    }
  }

  // Step 2 — only reachable by an explicit click on the diff.
  async function handleConfirmImport() {
    if (!pendingFile || !preview) return;
    setConfirming(true);
    setImportError(null);

    try {
      const body = new FormData();
      body.append("file", pendingFile);
      const response = await fetch(
        `/api/tasks/import?mode=${preview.mode}`,
        { method: "POST", body }
      );
      const data = await response.json();

      if (!response.ok) {
        setImportError(data.error ?? "Import failed.");
        return;
      }

      setTasks(data.tasks);
      const d = data.diff;
      setImportSummary(
        `Imported in ${data.mode} mode — ${d.addedCount} added, ${d.modifiedCount} modified, ` +
          `${d.unchangedCount} unchanged` +
          (d.destroyedCount > 0 ? `, ${d.destroyedCount} deleted` : "") +
          `. Registry now holds ${data.tasks.length} tasks.`
      );
      setPreview(null);
      setPendingFile(null);
    } catch {
      setImportError("Could not reach the import endpoint. Try again.");
    } finally {
      setConfirming(false);
    }
  }

  function handleCancelImport() {
    setPreview(null);
    setPendingFile(null);
    setImportError(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-text-heading">Task Library</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-text-muted">{filteredTasks.length} tasks</span>

          <label className="flex items-center gap-1.5 text-xs text-text-body">
            <span className="text-text-muted">Mode</span>
            <select
              value={importMode}
              onChange={(e) => setImportMode(e.target.value as ImportMode)}
              disabled={previewing || confirming}
              className={`rounded-lg border bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-navy-500 ${
                importMode === "replace"
                  ? "border-error/50 text-error font-semibold"
                  : "border-cream-border text-text-body"
              }`}
            >
              <option value="merge">merge (upsert, never deletes)</option>
              <option value="replace">replace (destructive)</option>
            </select>
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={handleFileSelected}
          />
          <Button
            variant="secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={previewing || confirming}
          >
            <Upload size={16} />
            {previewing ? "Reading…" : "Import"}
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

      {importSummary && (
        <p className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          {importSummary}
        </p>
      )}

      {preview && (
        <ImportDiffPreview
          preview={preview}
          onConfirm={handleConfirmImport}
          onCancel={handleCancelImport}
          confirming={confirming}
        />
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
