import { Lock } from "lucide-react";
import Link from "next/link";
import { STUDY_WINDOW } from "@/lib/reviewMode";

/**
 * Stands in for the Prompt Runner and Batch Runner pages under REVIEW_MODE.
 * Rendered from a route layout, so the runner's client component is never
 * mounted — reaching the URL directly cannot dispatch anything.
 */
export function ReviewModeDisabled({ pageName }: { pageName: string }) {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-display font-bold text-text-heading">{pageName}</h1>
      <div className="rounded-lg border border-cream-border bg-cream-card px-4 py-4 space-y-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-text-heading">
          <Lock size={16} />
          Disabled in review mode
        </p>
        <p className="text-sm text-text-body">
          This deployment is a read-only archive of the study completed on {STUDY_WINDOW.label}.
          The {pageName} makes live model calls and writes to the run record, so it is switched
          off here — both in the interface and at the API.
        </p>
        <p className="text-sm text-text-body">
          Everything the runners produced is still readable:{" "}
          <Link href="/results" className="underline text-navy-700 hover:text-navy-900">
            Results
          </Link>
          ,{" "}
          <Link href="/progress" className="underline text-navy-700 hover:text-navy-900">
            Progress
          </Link>
          , and{" "}
          <Link href="/export" className="underline text-navy-700 hover:text-navy-900">
            Export
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
