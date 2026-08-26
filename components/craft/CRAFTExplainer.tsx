import Link from "next/link";

interface CraftComponent {
  letter: string;
  name: string;
  color: string;
  definition: string;
  example: string;
}

const COMPONENTS: CraftComponent[] = [
  {
    letter: "C",
    name: "Context",
    color: "var(--color-craft-c)",
    definition:
      "Establishes the relevant background, situation, or problem setting that frames the model's response. Good context tells the model what kind of task this is and what information it should draw on.",
    example:
      "\"You are assisting a mid-sized logistics firm that needs to communicate a service delay to a key client. The delay is 48 hours and stems from a supplier issue outside the firm's control.\"",
  },
  {
    letter: "R",
    name: "Role",
    color: "var(--color-craft-r)",
    definition:
      "Assigns the model a professional identity or expertise that shapes the register, vocabulary, and perspective of the response. The role constrains who the model is being when it answers.",
    example:
      "\"You are a senior business communication specialist with experience in client relations and crisis messaging.\"",
  },
  {
    letter: "A",
    name: "Actions",
    color: "var(--color-craft-a)",
    definition:
      "Specifies the precise steps, outputs, or deliverables the model must produce. Actions replace vague task verbs (\"help me with...\") with structured instruction (\"produce X, then do Y, formatted as Z\").",
    example:
      "\"1. Draft a 150-word client email explaining the delay. 2. Include an apology, the reason, the revised timeline, and next steps. 3. Do not use passive voice.\"",
  },
  {
    letter: "F",
    name: "Format",
    color: "var(--color-craft-f)",
    definition:
      "Explicitly describes the structural shape of the expected output — length, sections, headers, list style, tables, or any other formatting requirement.",
    example:
      "\"Respond with a subject line, then the email body in plain prose. No bullet points. Maximum 200 words.\"",
  },
  {
    letter: "T",
    name: "Tone",
    color: "var(--color-craft-t)",
    definition:
      "Defines the professional register the response should use — formal, empathetic, assertive, neutral, technical, accessible. Tone controls how the model says what it says.",
    example:
      "\"Professional and empathetic. Maintain accountability without being self-critical. Avoid corporate jargon.\"",
  },
];

export function CRAFTExplainer() {
  return (
    <section className="space-y-6">
      <h2 className="text-2xl font-display font-bold text-text-heading">
        The CRAFT Framework
      </h2>

      <div className="space-y-4">
        {COMPONENTS.map((c) => (
          <div
            key={c.letter}
            className="rounded-lg bg-white border border-cream-border p-6 flex gap-6"
            style={{ borderLeft: `3px solid ${c.color}` }}
          >
            <div
              className="font-display font-bold shrink-0"
              style={{ fontSize: "48px", color: c.color, lineHeight: 1 }}
            >
              {c.letter}
            </div>
            <div className="space-y-2 min-w-0">
              <h3 className="text-lg font-semibold text-text-heading">{c.name}</h3>
              <p className="text-base text-text-body">{c.definition}</p>
              <div className="rounded-md bg-cream-card px-4 py-3 text-sm text-text-body font-mono">
                {c.example}
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm text-text-muted">
        The CRAFT framework is due to Joshi et al. (2026).{" "}
        <Link
          href="/references#framework-literature"
          className="text-navy-700 hover:text-navy-900 underline"
        >
          See References
        </Link>
        .
      </p>
    </section>
  );
}
