import type { SelectHTMLAttributes } from "react";

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-cream-border bg-white px-3 py-2 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-navy-500 ${className}`}
      {...props}
    />
  );
}
