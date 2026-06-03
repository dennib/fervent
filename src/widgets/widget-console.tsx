import React, { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useHeat } from "../engine/heat-provider";
import { Atmosphere } from "../engine/atmosphere";
import { Particles } from "../engine/particles";
import { tempHue, tempBand, heatNorm } from "../engine/helpers";
import { UnitToggle } from "../components/unit-toggle";
import { Menu } from "../components/menu";
import { GlassCard, CardTitle } from "../components/glass-card";
import { Gauge } from "../components/gauge";
import { Tube } from "../components/tube";
import { Kpi } from "../components/kpi";
import type { AtmosferaMood, ReadingMode, MenuMode } from "../types";

const MOODS: Record<AtmosferaMood, { bg: string; atm: number; card: { bg: string; blur: number; border: number } }> = {
  notturno: { bg: "#0a1220", atm: 1,    card: { bg: "rgba(18,26,42,0.42)",  blur: 26, border: 0.14 } },
  vetro:    { bg: "#0d1828", atm: 0.92, card: { bg: "rgba(42,60,90,0.16)",  blur: 44, border: 0.26 } },
  minimal:  { bg: "#0b1018", atm: 0.34, card: { bg: "rgba(13,19,29,0.7)",   blur: 14, border: 0.10 } },
};

const BANDS = ["cold", "cool", "warm", "hot"] as const;
const BAND_SRC: Record<string, string> = {
  cold: "/assets/cold-mountains.jpg",
  cool: "/assets/cool-forest.jpg",
  warm: "/assets/warm-beach.jpg",
  hot:  "/assets/hot-lava.jpg",
};

function BandImages({ band }: { band: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
      {BANDS.map((b) => (
        <img key={b} src={BAND_SRC[b]} alt="" style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover",
          opacity: b === band ? 1 : 0,
          pointerEvents: "none",
          transition: "opacity 1.4s ease",
        }} />
      ))}
    </div>
  );
}

function WindowControls() {
  const Btn = ({ onClick, title, hoverBg, symbol }: {
    onClick: () => void; title: string; hoverBg: string; symbol: string;
  }) => {
    const [hover, setHover] = useState(false);
    return (
      <button onClick={onClick} title={title} style={{
        width: 28, height: 18, borderRadius: 5, border: "none",
        background: hover ? hoverBg : "rgba(255,255,255,0.10)",
        color: hover ? "#fff" : "rgba(255,255,255,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer", fontSize: 10, lineHeight: 1,
        transition: "background .12s, color .12s",
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
        {symbol}
      </button>
    );
  };

  return (
    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
      <Btn onClick={() => getCurrentWindow().hide()}  title="Nascondi" hoverBg="rgba(255,180,0,0.55)"  symbol="–" />
      <Btn onClick={() => getCurrentWindow().close()} title="Chiudi"   hoverBg="rgba(220,60,40,0.55)"  symbol="✕" />
    </div>
  );
}

interface WidgetConsoleProps {
  mood?: AtmosferaMood;
  reading?: ReadingMode;
  energy?: number;
  menu?: MenuMode;
}

export function WidgetConsole({
  mood = "notturno",
  reading = "numeri",
  energy = 0.6,
  menu = "alto",
}: WidgetConsoleProps) {
  const { cpuC, gpuC, cpuHist, gpuHist } = useHeat();
  const [unit, setUnit] = useState<"C" | "F">("C");
  const peak = Math.max(cpuC, gpuC);
  const heat = heatNorm(peak);
  const band = tempBand(peak);
  const M = MOODS[mood] ?? MOODS.notturno;
  const particleCount = Math.round(6 + energy * 52);
  const blobDur = Math.max(5, 20 - heat * 6 - energy * 9).toFixed(1) + "s";

  const legend = (
    <div style={{ display: "flex", gap: 22, marginTop: 12 }}>
      {([["CPU", cpuC], ["GPU", gpuC]] as [string, number][]).map(([l, v]) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "ui-monospace, monospace", fontSize: 12, color: "rgba(255,255,255,0.72)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: `oklch(0.73 0.16 ${tempHue(v)})` }} />
          {l}
          <span style={{ color: "#fff", fontVariantNumeric: "tabular-nums" }}>{v.toFixed(0)}°</span>
        </div>
      ))}
    </div>
  );

  let cluster: React.ReactNode;

  if (reading === "anelli") {
    cluster = (
      <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, zIndex: 4, display: "flex", justifyContent: "center" }}>
        <GlassCard {...M.card} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px 40px" }}>
          <CardTitle>● TERMICA LIVE</CardTitle>
          <Gauge cpuC={cpuC} gpuC={gpuC} unit={unit} size={224} />
          {legend}
        </GlassCard>
      </div>
    );
  } else if (reading === "numeri") {
    cluster = (
      <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, zIndex: 4 }}>
        <GlassCard {...M.card}>
          <CardTitle>● TERMICA LIVE</CardTitle>
          <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
            <Kpi label="CPU" c={cpuC} hist={cpuHist} unit={unit} hue={tempHue(cpuC)} center sparkW={172} sparkH={36} />
            <div style={{ width: "0.5px", alignSelf: "stretch", background: "linear-gradient(transparent, rgba(255,255,255,0.22), transparent)" }} />
            <Kpi label="GPU" c={gpuC} hist={gpuHist} unit={unit} hue={tempHue(gpuC)} center sparkW={172} sparkH={36} />
          </div>
        </GlassCard>
      </div>
    );
  } else {
    cluster = (
      <div style={{ position: "absolute", left: 24, right: 24, bottom: 24, zIndex: 4, display: "flex", gap: 16, alignItems: "stretch" }}>
        <GlassCard {...M.card} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <CardTitle>● TERMICA LIVE</CardTitle>
          <Gauge cpuC={cpuC} gpuC={gpuC} unit={unit} size={176} />
          {legend}
        </GlassCard>
        <GlassCard {...M.card} style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <CardTitle>▌ TEMPERATURE</CardTitle>
          <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", justifyContent: "space-around" }}>
            <Tube label="CPU" c={cpuC} unit={unit} hue={tempHue(cpuC)} />
            <Tube label="GPU" c={gpuC} unit={unit} hue={tempHue(gpuC)} />
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%", overflow: "hidden",
      borderRadius: 22, background: M.bg, color: "#fff",
      fontFamily: '-apple-system, "Helvetica Neue", sans-serif',
      ["--blob-dur" as string]: blobDur,
    }}>
      <Atmosphere temp={peak} dark={true} heat={heat} intensity={M.atm} />
      <BandImages band={band} />
      {/* legibility scrim */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none",
        background: "linear-gradient(180deg, rgba(8,12,22,0.46) 0%, rgba(8,12,22,0.05) 26%, rgba(8,12,22,0.10) 52%, rgba(8,12,22,0.64) 100%), radial-gradient(150% 95% at 16% 102%, rgba(8,12,22,0.55), transparent 58%)",
      }} />
      <Particles key={particleCount} heat={heat} dark={true} count={particleCount} energy={energy} />

      {/* <Menu mode={menu} /> */}

      {/* Top chrome — draggable bar */}
      <div
        data-tauri-drag-region
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 52,
          zIndex: 10, display: "flex", alignItems: "center",
          justifyContent: "space-between", padding: "0 16px",
          cursor: "grab",
        }}
      >
        {/* Logo — left */}
        <div data-tauri-drag-region style={{ display: "flex", alignItems: "center", gap: 8, pointerEvents: "none" }}>
          <img src="/brand/Fervent-icon.svg" alt="Fervent" style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: "block" }} />
          <span style={{ fontWeight: 600, fontSize: 16, letterSpacing: -0.2 }}>Fervent</span>
        </div>

        {/* Right — unit toggle + window controls; stop drag propagation */}
        <div
          style={{ display: "flex", alignItems: "center", gap: 10 }}
          onMouseDown={e => e.stopPropagation()}
        >
          <UnitToggle unit={unit} setUnit={setUnit} dark={true} />
          <WindowControls />
        </div>
      </div>

      {/* KPI / gauge cluster */}
      {cluster}
    </div>
  );
}
