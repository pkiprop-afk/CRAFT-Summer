"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { ModelFamily } from "@/lib/models/registry";

export interface KeyStatusDto {
  family: ModelFamily;
  label: string;
  envVar: string;
  configured: boolean;
}

export function useKeyStatuses() {
  const [statuses, setStatuses] = useState<KeyStatusDto[] | null>(null);

  useEffect(() => {
    fetch("/api/health/keys")
      .then((r) => r.json())
      .then((data) => setStatuses(data.statuses))
      .catch(() => setStatuses(null));
  }, []);

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
