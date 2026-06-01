import React, { useEffect, useRef } from "react";

interface ParticlesProps {
  heat: number;
  dark: boolean;
  count?: number;
  energy?: number;
}

export function Particles({ heat, dark, count = 34, energy = 1 }: ParticlesProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const heatRef = useRef(heat);
  const enRef = useRef(energy);
  heatRef.current = heat;
  enRef.current = energy;

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf: number;
    let w = 0, h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    interface Particle { x: number; y: number; r: number; sp: number; drift: number; a: number; }
    const ps: Particle[] = [];

    const resize = () => {
      const r = cv.getBoundingClientRect();
      w = r.width; h = r.height;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    for (let i = 0; i < count; i++) {
      ps.push({
        x: Math.random() * w, y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        sp: 0.15 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.3,
        a: 0.1 + Math.random() * 0.4,
      });
    }

    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      const sp = (0.4 + heatRef.current * 1.7) * (0.45 + enRef.current * 1.1);
      for (const p of ps) {
        p.y -= p.sp * sp;
        p.x += p.drift * sp;
        if (p.y < -4) { p.y = h + 4; p.x = Math.random() * w; }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = dark
          ? `rgba(220,235,255,${p.a})`
          : `rgba(255,255,255,${p.a * 1.3})`;
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, [count, dark]);

  return (
    <canvas
      ref={ref}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    />
  );
}
