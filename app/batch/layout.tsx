import { ReviewModeDisabled } from "@/components/review/ReviewModeDisabled";
import { isReviewMode } from "@/lib/reviewMode";

/**
 * Server-side gate — see app/run/layout.tsx.
 */
export default function BatchLayout({ children }: { children: React.ReactNode }) {
  if (isReviewMode()) return <ReviewModeDisabled pageName="Batch Runner" />;
  return <>{children}</>;
}
