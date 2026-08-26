import { ReviewModeDisabled } from "@/components/review/ReviewModeDisabled";
import { isReviewMode } from "@/lib/reviewMode";

/**
 * Server-side gate — see app/run/layout.tsx.
 */
/** Read REVIEW_MODE per request — see app/layout.tsx. */
export const dynamic = "force-dynamic";

export default function BatchLayout({ children }: { children: React.ReactNode }) {
  if (isReviewMode()) return <ReviewModeDisabled pageName="Batch Runner" />;
  return <>{children}</>;
}
