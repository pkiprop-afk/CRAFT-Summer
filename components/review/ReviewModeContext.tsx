"use client";

import { createContext, useContext } from "react";

/**
 * Carries the server's REVIEW_MODE value to client components. The root layout
 * is a Server Component, so it reads process.env directly and passes the
 * resolved boolean down — no NEXT_PUBLIC_ mirror, one variable to set.
 */
const ReviewModeContext = createContext(false);

export function ReviewModeProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return <ReviewModeContext.Provider value={value}>{children}</ReviewModeContext.Provider>;
}

export function useReviewMode(): boolean {
  return useContext(ReviewModeContext);
}
