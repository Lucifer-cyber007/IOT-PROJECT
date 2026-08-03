"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/lib/types";

interface AnomalyDotProps {
  cx?: number;
  cy?: number;
  payload?: TrendPoint;
}

function AnomalyDot({ cx, cy, payload }: AnomalyDotProps) {
  if (cx == null || cy == null) return null;
  const isAnomaly = payload?.is_anomaly;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={isAnomaly ? 5 : 3}
      fill={isAnomaly ? "#f43f5e" : "#4f46e5"}
      stroke="#fff"
      strokeWidth={1.5}
    />
  );
}

export default function TrendChart({ points, height = 260 }: { points: TrendPoint[]; height?: number }) {
  const data = points.map((p) => ({
    ...p,
    label: new Date(p.captured_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
  }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} width={44} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
            labelFormatter={(_, payload) =>
              payload?.[0]?.payload ? new Date(payload[0].payload.captured_at).toLocaleString() : ""
            }
            formatter={(value, _name, item) => {
              const isAnomaly = (item?.payload as TrendPoint | undefined)?.is_anomaly;
              return [String(value), isAnomaly ? "Value (anomaly)" : "Value"];
            }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#4f46e5"
            strokeWidth={2}
            dot={<AnomalyDot />}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
