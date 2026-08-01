import { Check, X } from "lucide-react";

interface CraftSegment {
  letter: string;
  marker: string;
  color: string;
}

const SEGMENTS: CraftSegment[] = [
  { letter: "C", marker: "Context:", color: "var(--color-craft-c)" },
  { letter: "R", marker: "Role:", color: "var(--color-craft-r)" },
  { letter: "A", marker: "Actions:", color: "var(--color-craft-a)" },
  { letter: "F", marker: "Format:", color: "var(--color-craft-f)" },
  { letter: "T", marker: "Tone:", color: "var(--color-craft-t)" },
];

interface CRAFTMeterProps {
  craftPromptText: string;
}

export function CRAFTMeter({ craftPromptText }: CRAFTMeterProps) {
  const text = craftPromptText.toLowerCase();

  return (
    <div className="flex rounded-lg overflow-hidden border border-cream-border">
      {SEGMENTS.map((segment) => {
        const detected = text.includes(segment.marker.toLowerCase());
        return (
          <div
            key={segment.letter}
            className="flex-1 flex flex-col items-center gap-1 py-3"
            style={{
              backgroundColor: detected ? segment.color : "var(--color-cream-border)",
              color: detected ? "white" : "var(--color-text-muted)",
            }}
          >
            <span className="font-display font-bold text-xl leading-none">{segment.letter}</span>
            {detected ? <Check size={14} /> : <X size={14} />}
          </div>
        );
      })}
    </div>
  );
}
