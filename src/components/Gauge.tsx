import { tempHue, tempBand, fmtTemp } from "../engine/helpers";

interface GaugeRingProps {
  r: number; frac: number; color: string; sw: number; cx?: number;
}

function GaugeRing({ r, frac, color, sw, cx = 92 }: GaugeRingProps) {
  const cy = cx;
  const circ = 2 * Math.PI * r;
  const sweep = 270;
  const len = circ * (sweep / 360);
  return (
    <g transform={`rotate(135 ${cx} ${cy})`}>
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke="rgba(255,255,255,0.10)" strokeWidth={sw}
        strokeLinecap="round" strokeDasharray={`${len} ${circ}`} />
      <circle cx={cx} cy={cy} r={r} fill="none"
        stroke={color} strokeWidth={sw}
        strokeLinecap="round"
        strokeDasharray={`${len * frac} ${circ}`}
        style={{ transition: "stroke-dasharray .5s ease, stroke .5s ease", filter: `drop-shadow(0 0 5px ${color})` }} />
    </g>
  );
}

interface GaugeProps {
  cpuC: number; gpuC: number; unit: "C" | "F"; size?: number;
}

export function Gauge({ cpuC, gpuC, unit, size = 184 }: GaugeProps) {
  const peak = Math.max(cpuC, gpuC);
  const fr = (t: number) => Math.max(0.02, Math.min(1, (t - 30) / (95 - 30)));
  const hueC = tempHue(cpuC), hueG = tempHue(gpuC);
  const r1 = size * 0.445, r2 = size * 0.348, sw = Math.max(8, size * 0.049);
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <GaugeRing cx={size / 2} r={r1} frac={fr(cpuC)} color={`oklch(0.72 0.16 ${hueC})`} sw={sw} />
        <GaugeRing cx={size / 2} r={r2} frac={fr(gpuC)} color={`oklch(0.74 0.15 ${hueG})`} sw={sw} />
      </svg>
      <div style={{
        position: "absolute", inset: 0, display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: size * 0.052, letterSpacing: 2.5, color: "rgba(255,255,255,0.5)" }}>HOTSPOT</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
          <span style={{ fontFamily: '"Helvetica Neue", Helvetica, sans-serif', fontWeight: 200, fontSize: size * 0.315, lineHeight: 0.9, letterSpacing: -2, color: "#fff", fontVariantNumeric: "tabular-nums" }}>
            {fmtTemp(peak, unit)}
          </span>
          <span style={{ fontFamily: '"Helvetica Neue", sans-serif', fontWeight: 300, fontSize: size * 0.098, color: "rgba(255,255,255,0.55)" }}>°{unit}</span>
        </div>
        <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: size * 0.052, letterSpacing: 1, color: "rgba(255,255,255,0.4)", marginTop: 1 }}>
          {peak === cpuC ? "CPU" : "GPU"} · {tempBand(peak)}
        </div>
      </div>
    </div>
  );
}
