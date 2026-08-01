import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost";
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

  const variants: Record<string, string> = {
    primary: "bg-navy-700 text-white hover:bg-navy-900",
    secondary: "bg-cream-card text-text-heading border border-cream-border hover:bg-navy-100",
    ghost: "text-navy-700 hover:bg-navy-100",
  };

  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
