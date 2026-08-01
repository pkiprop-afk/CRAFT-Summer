"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";

export default function ExportPage() {
  const [taskCount, setTaskCount] = useState<number | null>(null);
  const [resultCount, setResultCount] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/results").then((r) => r.json()),
    ]).then(([tasks, results]) => {
      setTaskCount(tasks.length);
      setResultCount(results.length);
    });
  }, []);

  const exports = [
    {
      title: "Tasks CSV",
      description: "All fields from tasks.json as a CSV file.",
      href: "/api/export/tasks-csv",
      count: taskCount,
      unit: "tasks",
    },
    {
      title: "Results CSV",
      description: "All fields from results.json as a CSV file.",
      href: "/api/export/results-csv",
      count: resultCount,
      unit: "results",
    },
    {
      title: "Tasks JSONL",
      description: "Tasks as newline-delimited JSON, one record per line.",
      href: "/api/export/tasks-jsonl",
      count: taskCount,
      unit: "tasks",
    },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-display font-bold text-text-heading">Export</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {exports.map((item) => (
          <Card key={item.title} accentColor="var(--color-navy-700)">
            <p className="text-sm font-semibold text-text-heading mb-1">{item.title}</p>
            <p className="text-xs text-text-muted mb-4">{item.description}</p>
            <a
              href={item.href}
              className="inline-flex items-center gap-2 rounded-lg bg-navy-700 text-white px-4 py-2 text-sm font-medium hover:bg-navy-900"
            >
              <Download size={16} />
              Download
            </a>
            <p className="mt-2 text-xs text-text-muted">
              {item.count === null ? "…" : `${item.count} ${item.unit}`}
            </p>
          </Card>
        ))}
      </div>
    </div>
  );
}
