import { Ban, Check, Clock, Loader2, X } from "lucide-react";
import { DOMAIN_LABELS } from "@/types";
import { MODEL_LABEL } from "@/lib/models/registry";
import type { BatchJob } from "@/lib/batch";

function StatusBadge({ status }: { status: BatchJob["status"] }) {
  switch (status) {
    case "pending":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-text-muted">
          <Clock size={14} /> Pending
        </span>
      );
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-navy-700">
          <Loader2 size={14} className="animate-spin" /> Running
        </span>
      );
    case "evaluating":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-navy-700">
          <Loader2 size={14} className="animate-spin" /> Evaluating
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-success">
          <Check size={14} /> Done
        </span>
      );
    case "failed":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-error">
          <X size={14} /> Failed
        </span>
      );
    case "aborted":
      return (
        <span className="inline-flex items-center gap-1 text-xs text-warning">
          <Ban size={14} /> Aborted
        </span>
      );
  }
}

interface BatchJobListProps {
  jobs: BatchJob[];
}

export function BatchJobList({ jobs }: BatchJobListProps) {
  const done = jobs.filter((j) => j.status === "done").length;
  const aborted = jobs.filter((j) => j.status === "aborted").length;
  const failed = jobs.filter((j) => j.status === "failed").length;
  const inProgress = jobs.filter((j) => j.status === "running" || j.status === "evaluating").length;

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">
        {done}/{jobs.length} complete
        {failed > 0 && <span className="text-error"> · {failed} failed</span>}
        {inProgress > 0 && <span> · {inProgress} in progress</span>}
        {aborted > 0 && <span className="text-warning"> · {aborted} aborted</span>}
      </p>

      <div className="overflow-x-auto rounded-lg border border-cream-border">
        <table className="w-full text-sm">
          <thead className="bg-cream-card text-text-muted">
            <tr>
              <th className="text-left px-3 py-2">Task</th>
              <th className="text-left px-3 py-2">Domain</th>
              <th className="text-left px-3 py-2">Model</th>
              <th className="text-left px-3 py-2">Condition</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-left px-3 py-2">Score</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job, i) => (
              <tr
                key={`${job.task_id}-${job.model}-${job.condition}-${i}`}
                className="border-t border-cream-border"
              >
                <td className="px-3 py-2 font-mono text-xs">{job.task_id}</td>
                <td className="px-3 py-2 text-text-body">{DOMAIN_LABELS[job.domain]}</td>
                <td className="px-3 py-2 font-mono text-xs text-text-body">
                  {MODEL_LABEL[job.model]}
                </td>
                <td className="px-3 py-2 text-text-body capitalize">{job.condition}</td>
                <td className="px-3 py-2">
                  <StatusBadge status={job.status} />
                  {job.status === "failed" && job.error && (
                    <p className="text-xs text-error mt-0.5 max-w-xs">{job.error}</p>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {job.total_score !== undefined ? `${job.total_score}/10` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
