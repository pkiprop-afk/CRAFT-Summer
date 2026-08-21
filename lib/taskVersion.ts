import type { TaskRecord } from "@/types";

/**
 * 4g — CONTENT-HASH SCOPE (explicit and authoritative).
 *
 * task_version is a hash over exactly the fields that can change how a model
 * responds or how a response is scored. Editing any of them invalidates every
 * recorded run of that task: the run was produced against different content.
 *
 * INCLUDED — scoring-relevant:
 *   task_description      what the model is asked to do
 *   task_input            the artifact it operates on
 *   baseline_prompt       the baseline condition verbatim
 *   craft_context         )
 *   craft_role            )
 *   craft_actions         ) the five CRAFT components; craft_prompt is
 *   craft_format          ) derived from these, so hashing the components
 *   craft_tone            ) covers it without double-counting
 *   expected_constraints  what the evaluator scores against — ORDER INCLUDED
 *   rubric_notes          how the evaluator weights the scoring
 *
 * EXCLUDED — cosmetic or classificatory, cannot change a score:
 *   task_title                  display label only
 *   source_or_origin            provenance note
 *   difficulty_level            descriptive, never gates run logic
 *   domain                      grouping for reporting, not sent to the model
 *   requires_external_knowledge descriptive flag
 *   task_id                     identity, not content (immutable anyway)
 *   craft_prompt                derived from the five components above
 *   task_version                the hash itself
 *
 * ORDER SENSITIVITY: expected_constraints is serialized as an ordered array, so
 * reordering the list produces a different hash. This is deliberate — the list
 * editor permits reordering, and an evaluator justification refers to
 * constraints positionally ("constraint 3 was not met"). A reorder silently
 * remaps which constraint that justification points at, so it must invalidate.
 */
export const VERSIONED_FIELDS = [
  "task_description",
  "task_input",
  "baseline_prompt",
  "craft_context",
  "craft_role",
  "craft_actions",
  "craft_format",
  "craft_tone",
  "expected_constraints",
  "rubric_notes",
] as const;

export const UNVERSIONED_FIELDS = [
  "task_id",
  "task_title",
  "source_or_origin",
  "difficulty_level",
  "domain",
  "requires_external_knowledge",
  "craft_prompt",
  "task_version",
] as const;

/** Algorithm marker, so a future change to the scope or digest is detectable. */
const VERSION_PREFIX = "v1";

type VersionableTask = Pick<TaskRecord, (typeof VERSIONED_FIELDS)[number]>;

/**
 * Deterministic serialization of the versioned fields. Field order is fixed by
 * VERSIONED_FIELDS; array order inside expected_constraints is preserved.
 * Pure and synchronous — safe to use in client components.
 */
export function versionedPayload(task: Partial<VersionableTask>): string {
  return JSON.stringify(
    VERSIONED_FIELDS.map((field) => {
      const value = task[field];
      if (field === "expected_constraints") return [field, Array.isArray(value) ? value : []];
      return [field, typeof value === "string" ? value : ""];
    })
  );
}

/**
 * Sync equality check on the versioned fields — used by the editor to decide
 * whether a save would invalidate runs, without needing to hash in the browser.
 */
export function versionedFieldsEqual(
  a: Partial<VersionableTask>,
  b: Partial<VersionableTask>
): boolean {
  return versionedPayload(a) === versionedPayload(b);
}

/** Which versioned fields differ — for showing the user what invalidates. */
export function changedVersionedFields(
  a: Partial<VersionableTask>,
  b: Partial<VersionableTask>
): string[] {
  return VERSIONED_FIELDS.filter((field) => {
    const av = field === "expected_constraints" ? JSON.stringify(a[field] ?? []) : String(a[field] ?? "");
    const bv = field === "expected_constraints" ? JSON.stringify(b[field] ?? []) : String(b[field] ?? "");
    return av !== bv;
  });
}

/**
 * SHA-256 over the versioned payload. Uses Web Crypto, which is present in both
 * the Node runtime and the browser, so there is one implementation.
 */
export async function computeTaskVersion(task: Partial<VersionableTask>): Promise<string> {
  const bytes = new TextEncoder().encode(versionedPayload(task));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${VERSION_PREFIX}-${hex.slice(0, 32)}`;
}

export async function stampTaskVersion(task: TaskRecord): Promise<TaskRecord> {
  return { ...task, task_version: await computeTaskVersion(task) };
}

export async function stampTaskVersions(tasks: TaskRecord[]): Promise<TaskRecord[]> {
  return Promise.all(tasks.map(stampTaskVersion));
}
