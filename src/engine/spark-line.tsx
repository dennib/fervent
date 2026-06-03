import React, { useMemo } from "react";
import { smoothPath } from "./helpers";

interface SparkLineProps {
  values: number[];
  color: string;
  w?: number;
  h?: number;
  dur?: string;
}

export function SparkLine({ values, color, w = 150, h = 38, dur = "9s" }: SparkLineProps) {
  const vals = values.length ? values : [0, 0];
  const min = Math.min(...vals) - 1;
  const max = Math.max(...vals) + 1;
  const span = Math.max(1, max - min);
  const pts: [number, number][] = vals.map((v, i) => [
    (i / (vals.length - 1)) * w,
    h - 3 - ((v - min) / span) * (h - 6),
  ]);
  const d = smoothPath(pts);
  const gid = useMemo(() => "sg" + Math.random().toString(36).slice(2, 7), []);
  const last = pts[pts.length - 1];

  return (
    <svg
      className="fv-spark-wave"
      width={w} height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ "--wave-dur": dur, display: "block", overflow: "visible" } as React.CSSProperties}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w},${h} L 0,${h} Z`} fill={`url(#${gid})`} stroke="none" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}
