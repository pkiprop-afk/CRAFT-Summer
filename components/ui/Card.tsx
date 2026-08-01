import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  accentColor?: string;
  className?: string;
}

export function Card({ children, accentColor, className = "" }: CardProps) {
  return (
    <div
      className={`rounded-lg bg-cream-card border border-cream-border p-5 ${className}`}
      style={accentColor ? { borderLeft: `3px solid ${accentColor}` } : undefined}
    >
      {children}
    </div>
  );
}
