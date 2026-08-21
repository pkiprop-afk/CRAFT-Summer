import { FAMILY_LABEL, type ModelFamily } from "@/lib/models/registry";

export const ENV_VAR_BY_FAMILY: Record<ModelFamily, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
};

export class MissingApiKeyError extends Error {
  readonly family: ModelFamily;
  readonly envVar: string;

  constructor(family: ModelFamily) {
    const envVar = ENV_VAR_BY_FAMILY[family];
    super(
      `${envVar} is missing or blank in .env.local, so no ${FAMILY_LABEL[family]} calls can run. ` +
        `Add the key to .env.local and restart the dev server — environment variables are read at ` +
        `server startup, so an edit alone will not take effect.`
    );
    this.name = "MissingApiKeyError";
    this.family = family;
    this.envVar = envVar;
  }
}

export function isKeyConfigured(family: ModelFamily): boolean {
  return Boolean((process.env[ENV_VAR_BY_FAMILY[family]] ?? "").trim());
}

// Throws a MissingApiKeyError naming the exact env var, instead of letting the
// vendor SDK fail later with an opaque 401.
export function requireApiKey(family: ModelFamily): string {
  if (!isKeyConfigured(family)) throw new MissingApiKeyError(family);
  return (process.env[ENV_VAR_BY_FAMILY[family]] ?? "").trim();
}

export interface KeyStatus {
  family: ModelFamily;
  label: string;
  envVar: string;
  configured: boolean;
}

export function allKeyStatuses(): KeyStatus[] {
  return (Object.keys(ENV_VAR_BY_FAMILY) as ModelFamily[]).map((family) => ({
    family,
    label: FAMILY_LABEL[family],
    envVar: ENV_VAR_BY_FAMILY[family],
    configured: isKeyConfigured(family),
  }));
}
