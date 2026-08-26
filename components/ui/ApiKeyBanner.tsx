"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useReviewMode } from "@/components/review/ReviewModeContext";
import type { ModelFamily } from "@/lib/models/registry";

export interface KeyStatusDto {
  family: ModelFamily;
  label: string;
  envVar: string;
  configured: boolean;
}

export function useKeyStatuses() {
  const [statuses, setStatuses] = useState<KeyStatusDto[] | null>(null);
  // Under REVIEW_MODE every key is expected to be blank, so the preflight check
  // has nothing to report — skip the request entirely rather than fetch a
  // result whose only use would be to raise an alarm about a non-problem.
  const reviewMode = useReviewMode();

  useEffect(() => {
    if (reviewMode) return;
    fetch("/api/health/keys")
      .then((r) => r.json())
      .then((data) => setStatuses(data.statuses))
      .catch(() => setStatuses(null));
  }, [reviewMode]);

  return statuses;
}

export function isFamilyReady(statuses: KeyStatusDto[] | null, family: ModelFamily): boolean {
  if (!statuses) return true; // don't block while the check is still loading
  return statuses.find((s) => s.family === family)?.configured ?? false;
}

interface ApiKeyBannerProps {
  statuses: KeyStatusDto[] | null;
  // Only the families this page can actually invoke.
  families: ModelFamily[];
}

export function ApiKeyBanner({ statuses, families }: ApiKeyBannerProps) {
  const reviewMode = useReviewMode();
  // No keys are needed to read a stored study, so a "missing key" warning would
  // be noise on a page that is working exactly as intended.
  if (reviewMode) return null;
  if (!statuses) return null;
  const missing = statuses.filter((s) => families.includes(s.family) && !s.configured);
  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 space-y-1">
      <p className="flex items-center gap-2 text-sm font-semibold text-error">
        <AlertTriangle size={16} />
        Missing API {missing.length === 1 ? "key" : "keys"} — runs are blocked
      </p>
      <ul className="text-xs text-error/90 font-mono">
        {missing.map((s) => (
          <li key={s.envVar}>
            {s.envVar} (blank) — {s.label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-error/90">
        Add the {missing.length === 1 ? "key" : "keys"} to .env.local and restart the dev server.
        Environment variables are read at server startup, so editing the file alone will not take
        effect.
      </p>
    </div>
  );
}
