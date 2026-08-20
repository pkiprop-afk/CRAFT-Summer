"use client";

import { AlertTriangle, Check, FilePlus2, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ImportMode, TaskDiff } from "@/lib/taskDiff";
import type { ConstraintReport, HeaderNormalization, TaskImportError } from "@/lib/taskImport";

export interface ImportPreview {
  mode: ImportMode;
  sheetName: string | null;
  availableSheets: string[];
  totalRows: number;
  importedCount: number;
  rejectedCount: number;
  errors: TaskImportError[];
  headerNormalizations: HeaderNormalization[];
  domainMappedCount: number;
  constraintReports: ConstraintReport[];
  constraintFlaggedCount: number;
  ignoredCraftPromptRows: string[];
  diff: TaskDiff;
  existingCount: number;
  resultingCount: number;
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-cream-border bg-white px-3 py-2">
      <span className={tone}>{icon}</span>
      <div>
        <p className="text-lg font-semibold leading-none text-text-heading">{value}</p>
        <p className="text-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

interface ImportDiffPreviewProps {
  preview: ImportPreview;
  onConfirm: () => void;
  onCancel: () => void;
  confirming: boolean;
}

export function ImportDiffPreview({
  preview,
  onConfirm,
  onCancel,
  confirming,
}: ImportDiffPreviewProps) {
  const { diff } = preview;
  const destructive = diff.mode === "replace" && diff.destroyedCount > 0;
  const flagged = preview.constraintReports.filter((c) => c.flagged);

  return (
    <div className="space-y-4 rounded-lg border border-cream-border bg-cream-card p-4">
      <div>
        <h2 className="text-lg font-semibold text-text-heading">
          Import preview — nothing has been written yet
        </h2>
        <p className="text-xs text-text-muted">
          Mode: <span className="font-mono font-semibold">{diff.mode}</span>
          {preview.sheetName && (
            <>
              {" "}· sheet: <span className="font-mono">{preview.sheetName}</span>
            </>
          )}{" "}
          · {preview.totalRows} rows read · {preview.importedCount} valid ·{" "}
          {preview.rejectedCount} rejected
        </p>
      </div>

      {destructive && (
        <div className="rounded-lg border border-error/40 bg-error/10 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-error">
            <AlertTriangle size={16} />
            Destructive: {diff.destroyedCount}{" "}
            {diff.destroyedCount === 1 ? "task" : "tasks"} will be permanently deleted
          </p>
          <p className="mt-1 text-xs text-error/90">
            Replace mode discards every task not present in this file, including any in-app edits.
            Tasks to be lost:{" "}
            <span className="font-mono">{diff.destroyed.join(", ")}</span>
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat icon={<FilePlus2 size={18} />} label="added" value={diff.addedCount} tone="text-success" />
        <Stat icon={<Pencil size={18} />} label="modified" value={diff.modifiedCount} tone="text-navy-700" />
        <Stat icon={<Check size={18} />} label="unchanged" value={diff.unchangedCount} tone="text-text-muted" />
        <Stat icon={<Trash2 size={18} />} label="destroyed" value={diff.destroyedCount} tone={diff.destroyedCount > 0 ? "text-error" : "text-text-muted"} />
      </div>

      <p className="text-xs text-text-muted">
        Registry: {preview.existingCount} task{preview.existingCount === 1 ? "" : "s"} now →{" "}
        <span className="font-semibold text-text-heading">{preview.resultingCount}</span> after import
      </p>

      {preview.headerNormalizations.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-text-body">
            Headers normalized ({preview.headerNormalizations.length})
          </summary>
          <ul className="mt-1 font-mono text-text-muted">
            {preview.headerNormalizations.map((h) => (
              <li key={h.original}>
                &quot;{h.original}&quot; → {h.normalized}
              </li>
            ))}
          </ul>
        </details>
      )}

      {preview.domainMappedCount > 0 && (
        <p className="text-xs text-text-muted">
          {preview.domainMappedCount} row{preview.domainMappedCount === 1 ? "" : "s"} had a long
          domain label mapped to an enum value.
        </p>
      )}

      {flagged.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2">
          <p className="text-xs font-semibold text-warning">
            {flagged.length} row{flagged.length === 1 ? "" : "s"}: constraints did not split —
            verify
          </p>
          <ul className="mt-1 font-mono text-xs text-warning/90">
            {flagged.map((c) => (
              <li key={c.task_id}>
                row {c.row} {c.task_id} — imported as {c.count} constraint
                {c.count === 1 ? "" : "s"}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.ignoredCraftPromptRows.length > 0 && (
        <p className="text-xs text-warning">
          craft_prompt is derived and was ignored for{" "}
          {preview.ignoredCraftPromptRows.length} row(s) that supplied one.
        </p>
      )}

      {preview.errors.length > 0 && (
        <details className="text-xs" open>
          <summary className="cursor-pointer font-semibold text-error">
            {preview.errors.length} rejected row{preview.errors.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 space-y-1 font-mono text-text-muted max-h-40 overflow-y-auto">
            {preview.errors.map((e) => (
              <li key={e.row}>
                row {e.row} ({e.task_id}): {e.reasons.join("; ")}
              </li>
            ))}
          </ul>
        </details>
      )}

      {diff.modifiedCount > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-text-body">
            Field-level changes ({diff.modifiedCount} task{diff.modifiedCount === 1 ? "" : "s"})
          </summary>
          <div className="mt-2 space-y-3 max-h-72 overflow-y-auto">
            {diff.modified.map((m) => (
              <div key={m.task_id} className="rounded border border-cream-border bg-white p-2">
                <p className="font-mono text-xs font-semibold text-text-heading">{m.task_id}</p>
                <ul className="mt-1 space-y-1">
                  {m.changes.map((c) => (
                    <li key={c.field}>
                      <span className="font-mono text-text-muted">{c.field}</span>
                      <div className="ml-2">
                        <p className="text-error/80 break-words">− {c.before.slice(0, 200)}</p>
                        <p className="text-success break-words">+ {c.after.slice(0, 200)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      {diff.addedCount > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-text-body">
            Tasks added ({diff.addedCount})
          </summary>
          <p className="mt-1 font-mono text-text-muted break-words">{diff.added.join(", ")}</p>
        </details>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={onConfirm} disabled={confirming || preview.importedCount === 0}>
          {confirming
            ? "Importing…"
            : destructive
              ? `Confirm — delete ${diff.destroyedCount} and replace`
              : `Confirm ${diff.mode}`}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={confirming}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
