"use client";

import {
  CartesianGrid,
  Legend,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ResponsiveContainer,
} from "recharts";
import { DOMAIN_ACCENT_HEX, DOMAIN_LABELS, type Domain } from "@/types";

export interface ScatterDatum {
  task_id: string;
  domain: Domain;
  baseline: number;
  craft: number;
}

interface ScatterPlotProps {
  data: ScatterDatum[];
}

export function ScatterPlot({ data }: ScatterPlotProps) {
  const domains = Array.from(new Set(data.map((d) => d.domain)));

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ScatterChart margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-cream-border)" />
        <XAxis
          type="number"
          dataKey="baseline"
          name="Baseline score"
          domain={[0, 10]}
          stroke="var(--color-text-muted)"
          fontSize={12}
        />
        <YAxis
          type="number"
          dataKey="craft"
          name="CRAFT score"
          domain={[0, 10]}
          stroke="var(--color-text-muted)"
          fontSize={12}
        />
        <ZAxis range={[80, 80]} />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(value: number) => value}
          labelFormatter={() => ""}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <ReferenceLine
          segment={[
            { x: 0, y: 0 },
            { x: 10, y: 10 },
          ]}
          stroke="var(--color-text-muted)"
          strokeDasharray="4 4"
        />
        {domains.map((domain) => (
          <Scatter
            key={domain}
            name={DOMAIN_LABELS[domain]}
            data={data.filter((d) => d.domain === domain)}
            fill={DOMAIN_ACCENT_HEX[domain]}
          />
        ))}
      </ScatterChart>
    </ResponsiveContainer>
  );
}
