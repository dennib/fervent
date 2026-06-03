import { fmtTemp } from "../engine/helpers";

interface TubeProps {
  label: string;
  c: number;
  unit: "C" | "F";
  hue: number;
}

export function Tube({ label, c, unit, hue }: TubeProps) {
  const lvl = Math.max(0.05, Math.min(1, (c - 30) / (95 - 30)));
  const color = `oklch(0.72 0.16 ${hue})`;
  const colorHi = `oklch(0.82 0.15 ${hue})`;
  const warn = c >= 82;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 9, flex: 1 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
        <span style={{ fontFamily: '"Helvetica Neue", sans-serif', fontWeight: 300, fontSize: 26, color: "#fff", letterSpacing: -0.5, fontVariantNumeric: "tabular-nums" }}>
          {fmtTemp(c, unit)}
        </span>
      <span style={{ fontFamily: '"Helvetica Neue", sans-serif', fontWeight: 300, fontSize: 12, color: "rgba(255,255,255,0.5)" }}>°{unit}</span>
      </div>
      <div style={{
        position: "relative", width: 52, height: 130, borderRadius: 26, overflow: "hidden",
        background: "rgba(255,255,255,0.06)", border: "0.5px solid rgba(255,255,255,0.16)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -2px 8px rgba(0,0,0,0.25)",
      }}>
        {[0.25, 0.5, 0.75].map((t) => (
          <div key={t} style={{ position: "absolute", right: 6, bottom: `${t * 100}%`, width: 7, height: 1, background: "rgba(255,255,255,0.18)" }} />
        ))}
        <div style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: `${lvl * 100}%`,
          background: `linear-gradient(to top, ${color}, ${colorHi})`,
          boxShadow: `0 0 16px ${color}`,
          transition: "height .6s cubic-bezier(.4,0,.2,1), background .5s",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
        }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "rgba(255,255,255,0.7)", filter: "blur(1px)" }} />
        </div>
        {warn && (
          <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", color: "#1a1208", background: "oklch(0.85 0.16 70)", borderRadius: 8, padding: "2px 4px", display: "flex" }}>
            <svg width="11" height="11" viewBox="0 0 17 17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 2.5L15 14H2z" /><path d="M8.5 6.5v3.5" />
            </svg>
          </div>
        )}
      </div>
      <div style={{ fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 10.5, letterSpacing: 1.5, color: "rgba(255,255,255,0.55)" }}>{label}</div>
    </div>
  );
}
