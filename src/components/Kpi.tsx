import React from "react";
import { SparkLine } from "../engine/spark-line";
import { fmtTemp, heatNorm } from "../engine/helpers";

interface KpiProps {
  label: string;
  c: number;
  hist: number[];
  unit: "C" | "F";
  hue: number;
  center?: boolean;
  sparkW?: number;
  sparkH?: number;
}

export function Kpi({ label, c, hist, unit, hue, center = false, sparkW = 150, sparkH = 34 }: KpiProps) {
  const color = `oklch(0.74 0.15 ${hue})`;
  const hasData = isFinite(c);
  const prev = hist.length > 6 ? hist[hist.length - 6] : c;
  const delta = hasData ? c - prev : 0;
  const arrow = delta > 0.4 ? "▲" : delta < -0.4 ? "▼" : "◆";
  const ai = center ? "center" : "flex-start";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0, alignItems: ai }}>
      {/* label */}
      <div style={{
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11,
        letterSpacing: 3, color: "rgba(255,255,255,0.5)",
        display: "flex", alignItems: "center", gap: 8,
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: "50%",
          background: hasData ? color : "rgba(255,255,255,0.2)",
          boxShadow: hasData ? `0 0 8px ${color}` : "none",
        }} />
        {label}
      </div>

      {/* temperature value */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 2 }}>
        {hasData ? (
          <>
            <span style={{
              fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontWeight: 200,
              fontSize: 78, lineHeight: 0.9, letterSpacing: -3, color: "#fff",
              fontVariantNumeric: "tabular-nums", textShadow: "0 2px 30px rgba(0,0,0,0.4)",
            }}>{fmtTemp(c, unit)}</span>
            <span style={{ fontFamily: '"Helvetica Neue", sans-serif', fontWeight: 300, fontSize: 22, color: "rgba(255,255,255,0.6)" }}>°{unit}</span>
          </>
        ) : (
          <span style={{
            fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif', fontWeight: 200,
            fontSize: 78, lineHeight: 0.9, color: "rgba(255,255,255,0.18)",
            letterSpacing: -3,
          }}>—</span>
        )}
      </div>

      {/* sparkline or placeholder */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, height: sparkH }}>
        {hasData && hist.length > 1 ? (
          <SparkLine values={hist} color={color} w={sparkW} h={sparkH} dur={(9 - heatNorm(c) * 4).toFixed(1) + "s"} />
        ) : (
          <div style={{
            width: sparkW, height: 1,
            background: "rgba(255,255,255,0.08)",
            borderRadius: 1,
          }} />
        )}
      </div>

      {/* delta or "no sensor" hint */}
      <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 10.5, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
        {hasData ? (
          <><span style={{ color }}>{arrow}</span> {Math.abs(delta).toFixed(1)}° · 5m</>
        ) : (
          <span>sensore non disponibile</span>
        )}
      </div>
    </div>
  );
}
