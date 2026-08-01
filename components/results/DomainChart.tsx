"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface GroupedBarDatum {
  category: string;
  baseline: number;
  craft: number;
}

interface DomainChartProps {
  data: GroupedBarDatum[];
  maxValue?: number;
  height?: number;
}

export function DomainChart({ data, maxValue = 10, height = 280 }: DomainChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-cream-border)" vertical={false} />
        <XAxis dataKey="category" stroke="var(--color-text-muted)" fontSize={12} />
        <YAxis domain={[0, maxValue]} stroke="var(--color-text-muted)" fontSize={12} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="baseline" name="Baseline" fill="var(--color-cream-border)" radius={[4, 4, 0, 0]} />
        <Bar dataKey="craft" name="CRAFT" fill="var(--color-navy-700)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
