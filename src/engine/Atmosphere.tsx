import React from "react";
import { tempBand, tempHue } from "./helpers";

function bandPresets(dark: boolean): Record<string, string> {
  if (dark) return {
    cold: "radial-gradient(120% 90% at 28% 8%, #38598f 0%, rgba(56,89,143,0) 60%), radial-gradient(90% 70% at 80% 100%, #16324f 0%, rgba(22,50,79,0) 70%), linear-gradient(165deg, #0a1426 0%, #0e2036 100%)",
    cool: "radial-gradient(120% 90% at 30% 6%, #2f7d72 0%, rgba(47,125,114,0) 60%), radial-gradient(90% 70% at 78% 100%, #163f3a 0%, rgba(22,63,58,0) 70%), linear-gradient(165deg, #071714 0%, #0c241f 100%)",
    warm: "radial-gradient(120% 90% at 30% 8%, #b07a3c 0%, rgba(176,122,60,0) 60%), radial-gradient(90% 70% at 80% 100%, #6e3d22 0%, rgba(110,61,34,0) 70%), linear-gradient(165deg, #1c1108 0%, #2a1a0c 100%)",
    hot:  "radial-gradient(120% 90% at 30% 10%, #c85a3a 0%, rgba(200,90,58,0) 58%), radial-gradient(95% 75% at 78% 102%, #8a2b1c 0%, rgba(138,43,28,0) 70%), linear-gradient(165deg, #1f0a07 0%, #320f0a 100%)",
  };
  return {
    cold: "radial-gradient(120% 95% at 26% 4%, #cfe2f6 0%, rgba(207,226,246,0) 62%), radial-gradient(95% 78% at 82% 104%, #aecbe8 0%, rgba(174,203,232,0) 72%), linear-gradient(165deg, #f4f8fd 0%, #e6eef7 100%)",
    cool: "radial-gradient(120% 95% at 26% 4%, #cfeee2 0%, rgba(207,238,226,0) 62%), radial-gradient(95% 78% at 82% 104%, #bfe3d6 0%, rgba(191,227,214,0) 72%), linear-gradient(165deg, #f3fbf7 0%, #e6f3ed 100%)",
    warm: "radial-gradient(120% 95% at 26% 4%, #fbe6cc 0%, rgba(251,230,204,0) 62%), radial-gradient(95% 78% at 82% 104%, #f4d4bb 0%, rgba(244,212,187,0) 72%), linear-gradient(165deg, #fdf6ee 0%, #f7ece0 100%)",
    hot:  "radial-gradient(120% 95% at 26% 4%, #fad7c6 0%, rgba(250,215,198,0) 60%), radial-gradient(95% 78% at 82% 104%, #f3bda9 0%, rgba(243,189,169,0) 72%), linear-gradient(165deg, #fdf0ea 0%, #f8e0d6 100%)",
  };
}

interface AtmosphereProps {
  temp: number;
  dark: boolean;
  heat: number;
  intensity?: number;
}

export function Atmosphere({ temp, dark, heat, intensity = 1 }: AtmosphereProps) {
  const band = tempBand(temp);
  const presets = bandPresets(dark);
  const dur = (16 - heat * 9).toFixed(1) + "s";
  const hue = tempHue(temp);

  const blob = (
    h: number, anim: string,
    pos: React.CSSProperties,
    size: string, op: number
  ): React.CSSProperties => ({
    position: "absolute", ...pos, width: size, height: size, borderRadius: "50%",
    background: `radial-gradient(circle, oklch(${dark ? 0.62 : 0.82} 0.16 ${h}) 0%, transparent 68%)`,
    filter: "blur(14px)", opacity: op * intensity,
    mixBlendMode: dark ? "screen" : "multiply",
    animation: `${anim} ${dur} ease-in-out infinite`,
  });

  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      {(["cold", "cool", "warm", "hot"] as const).map((k) => (
        <div key={k} style={{
          position: "absolute", inset: 0, background: presets[k],
          opacity: k === band ? 1 : 0, transition: "opacity 1.6s ease",
        }} />
      ))}
      <div style={blob(hue,      "fv-blobA", { top: "-22%", left: "-8%" },   "58%", dark ? 0.5  : 0.55)} />
      <div style={blob(hue + 24, "fv-blobB", { bottom: "-30%", right: "-6%" }, "64%", dark ? 0.42 : 0.5)} />
      <div style={blob(hue - 18, "fv-blobC", { top: "20%", right: "18%" },   "40%", dark ? 0.34 : 0.4)} />
      <div style={{
        position: "absolute", inset: 0,
        opacity: (dark ? 0.05 : 0.045) * intensity,
        backgroundImage: "repeating-linear-gradient(135deg, currentColor 0 1px, transparent 1px 11px)",
        color: dark ? "#fff" : "#1a2a3a", pointerEvents: "none",
      }} />
      {intensity < 0.98 && (
        <div style={{
          position: "absolute", inset: 0,
          background: dark ? "#0a1018" : "#eef2f7",
          opacity: (1 - intensity) * 0.6, pointerEvents: "none",
        }} />
      )}
      <div style={{
        position: "absolute", inset: 0,
        boxShadow: dark
          ? "inset 0 0 90px rgba(0,0,0,0.55)"
          : "inset 0 0 70px rgba(120,140,170,0.18)",
        pointerEvents: "none",
      }} />
    </div>
  );
}
