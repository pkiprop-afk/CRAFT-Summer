// Type-only import: erased at runtime, so this module has no runtime imports
// and can be loaded directly by a plain Node script as well as by Next.
import type { ModelFamily } from "./registry";

/**
 * Model availability check.
 *
 * Confirms that every model ID configured in registry.ts is actually offered by
 * its provider. Uses model-LIST endpoints only — no generation, so this costs
 * zero tokens and is safe to run before any benchmark run.
 *
 * It never substitutes a replacement model. A retired test model is a
 * proposal-level change to the study, not a config change to be papered over.
 *
 * All three providers paginate. Google defaults to 50 results per page and
 * Anthropic to 20, so a single unpaginated call can report a model as absent
 * when it is merely on page 2. Every listing here is fully paginated.
 */

/**
 * Per-model provenance as the provider reports it. Fields vary by vendor:
 *   Anthropic — created_at, display_name
 *   OpenAI    — created (unix, converted), shutdown_date
 *   Google    — NO creation timestamp; version + description only, where the
 *               description encodes the stable-release date
 */
export interface ProviderModelEntry {
  id: string;
  created_at: string | null;
  display_name: string | null;
  version: string | null;
  description: string | null;
  shutdown_date: string | null;
}

/**
 * The value drift is compared on. Uses created_at where the provider supplies
 * one; otherwise falls back to version+description, so a provider that exposes
 * no timestamp (Google) is still monitored rather than silently unmonitored.
 */
export function provenanceFingerprint(entry: ProviderModelEntry): string {
  if (entry.created_at) return `created_at:${entry.created_at}`;
  return `version:${entry.version ?? ""}|description:${entry.description ?? ""}`;
}

export interface ProviderListing {
  family: ModelFamily;

  reachable: boolean;
  httpStatus: number | null;
  models: string[];
  entries: ProviderModelEntry[];
  error: string | null;
}

function sanitize(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/key=[A-Za-z0-9._-]+/gi, "key=[redacted]")
    .slice(0, 300);
}

function failure(family: ModelFamily, httpStatus: number | null, error: string): ProviderListing {
  return {
    family,

    reachable: false,
    httpStatus,
    models: [],
    entries: [],
    error: sanitize(error),
  };
}

/** Anthropic: cursor pagination via `after_id` + `has_more`. */
export async function listAnthropicModels(apiKey: string): Promise<ProviderListing> {
  const entries: ProviderModelEntry[] = [];
  let afterId: string | null = null;

  try {
    for (let page = 0; page < 20; page++) {
      const url = new URL("https://api.anthropic.com/v1/models");
      url.searchParams.set("limit", "1000");
      if (afterId) url.searchParams.set("after_id", afterId);

      const res = await fetch(url, {
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      });
      if (!res.ok) {
        return failure("anthropic", res.status, `HTTP ${res.status}: ${await res.text()}`);
      }
      const body = await res.json();
      for (const m of body.data ?? []) {
        entries.push({
          id: m.id,
          created_at: m.created_at ?? null,
          display_name: m.display_name ?? null,
          version: null,
          description: null,
          shutdown_date: null,
        });
      }
      if (!body.has_more) break;
      afterId = body.last_id ?? null;
      if (!afterId) break;
    }
    return {
      family: "anthropic",

      reachable: true,
      httpStatus: 200,
      models: entries.map((e) => e.id),
      entries,
      error: null,
    };
  } catch (err) {
    return failure("anthropic", null, err instanceof Error ? err.message : "request failed");
  }
}

/** OpenAI: returns the full list in one response. */
export async function listOpenAIModels(apiKey: string): Promise<ProviderListing> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      return failure("openai", res.status, `HTTP ${res.status}: ${await res.text()}`);
    }
    const body = await res.json();
    const raw: Array<{ id: string; created?: number; shutdown_date?: string | null }> =
      body.data ?? [];
    const entries: ProviderModelEntry[] = raw.map((m) => ({
      id: m.id,
      created_at: m.created ? new Date(m.created * 1000).toISOString() : null,
      display_name: null,
      version: null,
      description: null,
      // OpenAI publishes retirement dates — an early warning that a pinned
      // snapshot is scheduled to disappear.
      shutdown_date: m.shutdown_date ?? null,
    }));
    return {
      family: "openai",

      reachable: true,
      httpStatus: 200,
      models: entries.map((e) => e.id),
      entries,
      error: null,
    };
  } catch (err) {
    return failure("openai", null, err instanceof Error ? err.message : "request failed");
  }
}

/** Google: token pagination via `nextPageToken`; default page size is 50. */
export async function listGoogleModels(apiKey: string): Promise<ProviderListing> {
  const entries: ProviderModelEntry[] = [];
  let pageToken: string | null = null;

  try {
    for (let page = 0; page < 20; page++) {
      const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
      url.searchParams.set("pageSize", "1000");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url, { headers: { "x-goog-api-key": apiKey } });
      if (!res.ok) {
        return failure("google", res.status, `HTTP ${res.status}: ${await res.text()}`);
      }
      const body = await res.json();
      for (const m of body.models ?? []) {
        entries.push({
          id: String(m.name).replace(/^models\//, ""),
          // Google exposes no creation timestamp for generative models; the
          // release date is only present inside `description`.
          created_at: null,
          display_name: m.displayName ?? null,
          version: m.version ?? null,
          description: m.description ?? null,
          shutdown_date: null,
        });
      }
      pageToken = body.nextPageToken ?? null;
      if (!pageToken) break;
    }
    return {
      family: "google",

      reachable: true,
      httpStatus: 200,
      models: entries.map((e) => e.id),
      entries,
      error: null,
    };
  } catch (err) {
    return failure("google", null, err instanceof Error ? err.message : "request failed");
  }
}

/**
 * Which family a model ID belongs to, inferred from its vendor prefix.
 * Returns null for strings that are not model IDs.
 */
export function familyFromModelId(id: string): ModelFamily | null {
  if (/^claude-/i.test(id)) return "anthropic";
  if (/^(gpt-|o[1-9](-|$)|chatgpt-)/i.test(id)) return "openai";
  if (/^gemini-/i.test(id)) return "google";
  return null;
}

export interface ModelIdLiteral {
  file: string;
  line: number;
  model_id: string;
  family: ModelFamily;
}

/**
 * Finds every model ID string literal in the given sources.
 *
 * The registry is not the only place a model ID is pinned — the provider
 * wrappers hard-code their own literals (e.g. `model: "claude-3-5-sonnet-latest"`).
 * A registry-only check passes while the wrapper still calls a retired model,
 * which is exactly the stale-pin failure this is meant to catch.
 *
 * Comments are stripped first, so a model ID mentioned in prose does not fail
 * the check — only IDs that could actually be sent to an API.
 */
export function scanModelIdLiterals(
  files: Array<{ path: string; source: string }>
): ModelIdLiteral[] {
  const found: ModelIdLiteral[] = [];

  for (const { path: filePath, source } of files) {
    // Blank out comments while preserving line numbering.
    const stripped = source
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

    stripped.split(/\r?\n/).forEach((lineText, index) => {
      const literal = /["'`]([A-Za-z0-9][A-Za-z0-9._-]*)["'`]/g;
      let match: RegExpExecArray | null;
      while ((match = literal.exec(lineText)) !== null) {
        const id = match[1];
        const family = familyFromModelId(id);
        if (!family) continue;
        found.push({ file: filePath, line: index + 1, model_id: id, family });
      }
    });
  }

  return found;
}

export interface LiteralCheck extends ModelIdLiteral {
  present: boolean;
  note: string;
  similar: string[];
}

export function checkModelIdLiterals(
  literals: ModelIdLiteral[],
  listings: ProviderListing[]
): { checks: LiteralCheck[]; missing: LiteralCheck[]; allPresent: boolean } {
  const byFamily = new Map(listings.map((l) => [l.family, l]));
  const checks: LiteralCheck[] = [];

  for (const lit of literals) {
    const listing = byFamily.get(lit.family);
    if (!listing || !listing.reachable) {
      checks.push({
        ...lit,
        present: false,
        similar: [],
        note: listing?.error ? `provider unreachable — ${listing.error}` : "provider not checked",
      });
      continue;
    }
    const { present, matched } = matchModel(lit.model_id, listing.models);
    checks.push({
      ...lit,
      present,
      similar: present ? matched.slice(0, 4) : similarTo(lit.model_id, listing.models),
      note: present
        ? matched[0] === lit.model_id
          ? "exact match"
          : `matched dated/aliased build: ${matched[0]}`
        : "NOT OFFERED by provider",
    });
  }

  const missing = checks.filter((c) => !c.present);
  return { checks, missing, allPresent: missing.length === 0 };
}

export interface ConfiguredModelCheck {
  model_id: string;
  family: ModelFamily;
  present: boolean;
  /** Provider IDs that look related, to help identify a successor. Never auto-applied. */
  similar: string[];
  note: string;
}

/**
 * Providers often expose dated or aliased variants (e.g. `-latest`, `-20240620`).
 * A configured ID counts as present on an exact match, or when the provider
 * offers an ID that starts with it (a dated build of the same model).
 */
function matchModel(configured: string, available: string[]): { present: boolean; matched: string[] } {
  const exact = available.filter((a) => a === configured);
  const prefixed = available.filter((a) => a.startsWith(configured) && a !== configured);
  return { present: exact.length > 0 || prefixed.length > 0, matched: [...exact, ...prefixed] };
}

function similarTo(configured: string, available: string[]): string[] {
  // Compare on the leading alphabetic stem, e.g. "claude", "gemini", "gpt".
  const stem = configured.split(/[-.]/)[0].toLowerCase();
  return available.filter((a) => a.toLowerCase().startsWith(stem)).slice(0, 12);
}

/**
 * `modelFamily` is passed in (rather than imported) so this module stays free
 * of runtime imports — see the type-only import at the top.
 */
export function checkConfiguredModels(
  listings: ProviderListing[],
  modelFamily: Record<string, ModelFamily>
): {
  checks: ConfiguredModelCheck[];
  missing: ConfiguredModelCheck[];
  allPresent: boolean;
} {
  const byFamily = new Map(listings.map((l) => [l.family, l]));
  const checks: ConfiguredModelCheck[] = [];

  for (const [modelId, family] of Object.entries(modelFamily)) {
    const listing = byFamily.get(family);
    if (!listing || !listing.reachable) {
      checks.push({
        model_id: modelId,
        family,
        present: false,
        similar: [],
        note: listing?.error
          ? `provider unreachable — ${listing.error}`
          : "provider not checked",
      });
      continue;
    }

    const { present, matched } = matchModel(modelId, listing.models);
    checks.push({
      model_id: modelId,
      family,
      present,
      similar: present ? matched.slice(0, 6) : similarTo(modelId, listing.models),
      note: present
        ? matched[0] === modelId
          ? "exact match"
          : `matched dated/aliased build: ${matched[0]}`
        : "NOT OFFERED by provider",
    });
  }

  const missing = checks.filter((c) => !c.present);
  return { checks, missing, allPresent: missing.length === 0 };
}
