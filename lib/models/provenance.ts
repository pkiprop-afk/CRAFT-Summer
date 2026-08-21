import { promises as fs } from "fs";
import path from "path";
import type { ModelManifest } from "@/lib/models/manifest";

/**
 * Server-side provenance lookup for stamping runs and evaluations.
 *
 * Reads the most recent captured manifest rather than calling the provider on
 * every run: a run must record what the model WAS at capture time, and an extra
 * network round trip per run would be both slow and a second source of truth.
 *
 * If no manifest exists the caller must refuse to run — a result without
 * provenance cannot be shown to have been produced by an unmoved model.
 */

const MANIFEST_DIR = path.join(process.cwd(), "data", "model_manifests");

let cached: { manifest: ModelManifest; file: string } | null = null;

export class MissingManifestError extends Error {
  constructor() {
    super(
      "No model manifest found. Run `npm run capture-model-manifest` before any run — " +
        "results cannot be stamped with model provenance without one."
    );
    this.name = "MissingManifestError";
  }
}

export async function loadLatestManifest(): Promise<{ manifest: ModelManifest; file: string }> {
  let files: string[];
  try {
    files = (await fs.readdir(MANIFEST_DIR)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    throw new MissingManifestError();
  }
  if (files.length === 0) throw new MissingManifestError();

  const file = files[files.length - 1];
  if (cached?.file === file) return cached;

  const raw = await fs.readFile(path.join(MANIFEST_DIR, file), "utf-8");
  cached = { manifest: JSON.parse(raw) as ModelManifest, file };
  return cached;
}

/** Throws if the model is absent from the manifest — never returns a guess. */
export async function provenanceFingerprintFor(modelId: string): Promise<string> {
  const { manifest, file } = await loadLatestManifest();
  const entry = manifest.entries.find((e) => e.model_id === modelId);
  if (!entry) {
    throw new Error(
      `Model ${modelId} is not present in the latest manifest (${file}). ` +
        "Re-capture the manifest, or the model has been retired."
    );
  }
  return entry.provenance_fingerprint;
}

/** Test seam — clears the in-process manifest cache. */
export function resetProvenanceCache(): void {
  cached = null;
}
