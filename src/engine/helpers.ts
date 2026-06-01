import type { TempBand } from "../types";

export function tempHue(t: number): number {
  const x = Math.max(0, Math.min(1, (t - 38) / (86 - 38)));
  return 232 - x * (232 - 24);
}

export function heatNorm(t: number): number {
  return Math.max(0, Math.min(1, (t - 38) / (88 - 38)));
}

export function tempBand(t: number): TempBand {
  if (t < 48) return "cold";
  if (t < 62) return "cool";
  if (t < 76) return "warm";
  return "hot";
}

export function fmtTemp(c: number, unit: "C" | "F"): number {
  const v = unit === "F" ? (c * 9) / 5 + 32 : c;
  return Math.round(v);
}

export const SCENES: Record<TempBand, string> = {
  cold: "montagne · ghiaccio",
  cool: "foresta · lago",
  warm: "deserto · dune",
  hot: "lava · brace",
};

/** Catmull-Rom → cubic bezier smooth SVG path */
export function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return "";
  let d = `M ${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}
