"use client";

interface TabsProps {
  tabs: string[];
  active: string;
  onChange: (tab: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="flex gap-1 border-b border-cream-border">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            tab === active
              ? "border-navy-700 text-navy-900"
              : "border-transparent text-text-muted hover:text-text-body"
          }`}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
