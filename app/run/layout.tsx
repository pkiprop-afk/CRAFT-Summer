import { ReviewModeDisabled } from "@/components/review/ReviewModeDisabled";
import { isReviewMode } from "@/lib/reviewMode";

/**
 * Server-side gate. Under REVIEW_MODE the runner's client component is never
 * rendered, so navigating straight to /run cannot mount anything that dispatches.
 */
export default function RunLayout({ children }: { children: React.ReactNode }) {
  if (isReviewMode()) return <ReviewModeDisabled pageName="Prompt Runner" />;
  return <>{children}</>;
}
