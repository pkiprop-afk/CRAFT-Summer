import type { ModelFamily } from "./registry";

/**
 * Model provenance manifests.
 *
 * Dated snapshot IDs exist only on OpenAI; Anthropic's 5-series and Google's
 * generative models are bare IDs that a provider can repoint without notice.
 * A manifest records each model's `created_at` at a point in time, so drift can
 * be detected after the fact even when the ID itself cannot be pinned.
 *
 * Capture one before the study and one after; a change in `created_at` for any
 * configured model means the model moved under the study.
 */

export interface ManifestEntry {
  model_id: string;
  family: ModelFamily;
  /** ISO-8601 where the provider supplies one, else null (Google exposes none). */
  created_at: string | null;
  display_name: string | null;
  version: string | null;
  description: string | null;
  /** OpenAI only — scheduled retirement date, an early warning for a pinned ID. */
  shutdown_date: string | null;
  /**
   * The value drift is compared on: created_at when available, otherwise
   * version+description. Stored so comparison does not depend on which fields a
   * provider happened to expose at capture time.
   */
  provenance_fingerprint: string;
  /** Whether this ID is in the configured model set. */
  configured: boolean;
}

export interface ModelManifest {
  captured_at: string;
  entries: ManifestEntry[];
  providers: Array<{
    family: ModelFamily;
    reachable: boolean;
    modelCount: number;
    /** True when the provider exposes no creation timestamps at all. */
    createdAtAvailable: boolean;
    error: string | null;
  }>;
}

export function manifestFilename(capturedAt: string): string {
  // Colons are not filesystem-safe on Windows.
  return `manifest-${capturedAt.replace(/[:.]/g, "-")}.json`;
}

/** Looks up a configured model's recorded created_at. */
export function createdAtOf(manifest: ModelManifest, modelId: string): string | null {
  return manifest.entries.find((e) => e.model_id === modelId)?.created_at ?? null;
}

export interface DriftFinding {
  model_id: string;
  reason: "disappeared" | "appeared" | "provenance_changed";
  previous_fingerprint: string | null;
  current_fingerprint: string | null;
  previous_created_at: string | null;
  current_created_at: string | null;
}

/**
 * Compares configured models between two manifests. A configured model that
 * disappeared, appeared, or whose provenance fingerprint moved is drift.
 */
export function detectDrift(
  previous: ModelManifest,
  current: ModelManifest,
  configuredIds: string[]
): DriftFinding[] {
  const findings: DriftFinding[] = [];

  for (const id of configuredIds) {
    const before = previous.entries.find((e) => e.model_id === id);
    const after = current.entries.find((e) => e.model_id === id);

    if (before && !after) {
      findings.push({
        model_id: id,
        reason: "disappeared",
        previous_fingerprint: before.provenance_fingerprint,
        current_fingerprint: null,
        previous_created_at: before.created_at,
        current_created_at: null,
      });
      continue;
    }
    if (!before && after) {
      findings.push({
        model_id: id,
        reason: "appeared",
        previous_fingerprint: null,
        current_fingerprint: after.provenance_fingerprint,
        previous_created_at: null,
        current_created_at: after.created_at,
      });
      continue;
    }
    if (!before || !after) continue;

    if (before.provenance_fingerprint !== after.provenance_fingerprint) {
      findings.push({
        model_id: id,
        reason: "provenance_changed",
        previous_fingerprint: before.provenance_fingerprint,
        current_fingerprint: after.provenance_fingerprint,
        previous_created_at: before.created_at,
        current_created_at: after.created_at,
      });
    }
  }

  return findings;
}
