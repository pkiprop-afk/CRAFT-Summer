/**
 * 5a — Pair settings binding.
 *
 * The two conditions of a pair must be generated under identical decoding
 * settings. If baseline ran at temperature 0.2 and CRAFT at 0.7, any score
 * difference is confounded by sampling, not attributable to the prompt.
 *
 * The hash covers exactly the settings that change generation:
 *   temperature, max_tokens, system_prompt
 */
export interface RunSettings {
  temperature: number;
  max_tokens: number;
  system_prompt: string;
}

export const SETTINGS_FIELDS: Array<keyof RunSettings> = [
  "temperature",
  "max_tokens",
  "system_prompt",
];

export function runSettingsPayload(settings: RunSettings): string {
  return JSON.stringify([
    ["temperature", settings.temperature],
    ["max_tokens", settings.max_tokens],
    ["system_prompt", settings.system_prompt],
  ]);
}

export async function computeRunSettingsHash(settings: RunSettings): Promise<string> {
  const bytes = new TextEncoder().encode(runSettingsPayload(settings));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `rs1-${hex.slice(0, 16)}`;
}

export interface SettingsMismatch {
  field: keyof RunSettings;
  earlier_value: string;
  attempted_value: string;
}

/** Names every differing field, so the error says what to change. */
export function diffRunSettings(
  earlier: RunSettings,
  attempted: RunSettings
): SettingsMismatch[] {
  const mismatches: SettingsMismatch[] = [];
  for (const field of SETTINGS_FIELDS) {
    if (String(earlier[field]) !== String(attempted[field])) {
      mismatches.push({
        field,
        earlier_value: String(earlier[field]),
        attempted_value: String(attempted[field]),
      });
    }
  }
  return mismatches;
}
