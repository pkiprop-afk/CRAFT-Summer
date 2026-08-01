"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface OverviewChartProps {
  meanBaseline: number;
  meanCraft: number;
}

export function OverviewChart({ meanBaseline, meanCraft }: OverviewChartProps) {
  const data = [
    { condition: "Baseline", score: meanBaseline, fill: "var(--color-cream-border)" },
    { condition: "CRAFT", score: meanCraft, fill: "var(--color-navy-700)" },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} layout="vertical" margin={{ left: 16 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-cream-border)" horizontal={false} />
        <XAxis type="number" domain={[0, 10]} stroke="var(--color-text-muted)" fontSize={12} />
        <YAxis type="category" dataKey="condition" stroke="var(--color-text-muted)" fontSize={12} width={80} />
        <Tooltip />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {data.map((entry) => (
            <Cell key={entry.condition} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
