
interface UnitToggleProps {
  unit: "C" | "F";
  setUnit: (u: "C" | "F") => void;
  dark: boolean;
}

export function UnitToggle({ unit, setUnit, dark }: UnitToggleProps) {
  const base = dark ? "rgba(255,255,255,0.55)" : "rgba(20,30,45,0.5)";
  const on = dark ? "#fff" : "#16263a";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 2, padding: 2, borderRadius: 20,
      background: dark ? "rgba(255,255,255,0.08)" : "rgba(20,40,70,0.07)",
      border: `0.5px solid ${dark ? "rgba(255,255,255,0.12)" : "rgba(20,40,70,0.1)"}`,
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', fontSize: 11,
    }}>
      {(["C", "F"] as const).map((u) => (
        <button key={u} onClick={() => setUnit(u)} style={{
          border: "none", cursor: "pointer", width: 24, height: 20, borderRadius: 16,
          background: unit === u
            ? (dark ? "rgba(255,255,255,0.16)" : "rgba(20,40,70,0.12)")
            : "transparent",
          color: unit === u ? on : base,
          fontFamily: "inherit", fontSize: 11, fontWeight: 600,
        }}>°{u}</button>
      ))}
    </div>
  );
}
