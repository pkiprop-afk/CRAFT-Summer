import type { ReactNode } from "react";

interface BadgeProps {
  children: ReactNode;
  variant?: "mono" | "pill" | "navy";
  color?: string;
  className?: string;
}

export function Badge({ children, variant = "pill", color, className = "" }: BadgeProps) {
  const base = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium";

  if (variant === "mono") {
    return (
      <span className={`${base} font-mono bg-navy-100 text-navy-900 ${className}`}>
        {children}
      </span>
    );
  }

  if (variant === "navy") {
    return (
      <span className={`${base} bg-navy-900 text-cream ${className}`}>{children}</span>
    );
  }

  return (
    <span
      className={`${base} text-white ${className}`}
      style={{ backgroundColor: color ?? "var(--color-navy-700)" }}
    >
      {children}
    </span>
  );
}
