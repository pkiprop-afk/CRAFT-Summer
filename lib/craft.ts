export interface CraftComponents {
  craft_context: string;
  craft_role: string;
  craft_actions: string;
  craft_format: string;
  craft_tone: string;
}

// The single source of truth for how the five CRAFT components combine into
// craft_prompt. Labels must match what CRAFTMeter scans for.
export function assembleCraftPrompt(components: CraftComponents): string {
  const { craft_context, craft_role, craft_actions, craft_format, craft_tone } = components;
  return [
    `Context: ${craft_context}`,
    `Role: ${craft_role}`,
    `Actions: ${craft_actions}`,
    `Format: ${craft_format}`,
    `Tone: ${craft_tone}`,
  ].join("\n\n");
}
