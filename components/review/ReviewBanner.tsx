import { Archive } from "lucide-react";
import { STUDY_WINDOW } from "@/lib/reviewMode";

/**
 * Sitewide banner shown only when REVIEW_MODE=true. States plainly that the
 * app is serving a finished record, so a reader never has to wonder whether a
 * figure on screen is provisional or whether they are expected to run anything.
 */
export function ReviewBanner() {
  return (
    <div className="border-b border-navy-700/20 bg-navy-700/10">
      <div className="mx-auto max-w-[1280px] px-4 py-3 md:px-8 flex items-start gap-3">
        <Archive size={18} className="mt-0.5 shrink-0 text-navy-700" />
        <div className="text-sm text-text-body">
          <p className="font-semibold text-text-heading">
            Read-only archive of a completed study
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            Data collected {STUDY_WINDOW.detail}. Every figure is served from the stored run
            record — generation and evaluation are disabled, and no API keys are needed to read
            anything here.
          </p>
        </div>
      </div>
    </div>
  );
}
