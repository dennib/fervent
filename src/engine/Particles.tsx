import React, { useEffect, useRef } from "react";

interface ParticlesProps {
  heat: number;
  dark: boolean;
  count?: number;
  energy?: number;
}

export function Particles({
  heat,
  dark,
  count = 34,
  energy = 1,
}: ParticlesProps) {
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
    let w = 0,
      h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);

    interface Particle {
      x: number;
      y: number;
      r: number;
      sp: number;
      drift: number;
      a: number;
    }
    const ps: Particle[] = [];

    const resize = () => {
      const r = cv.getBoundingClientRect();
      w = r.width;
      h = r.height;
      cv.width = w * dpr;
      cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    for (let i = 0; i < count; i++) {
      ps.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 1.8,
        sp: 0.3 + Math.random() * 0.7, // per-particle speed variance
        drift: (Math.random() - 0.5) * 2, // per-particle horizontal direction
        a: 0.1 + Math.random() * 0.45,
      });
    }

    // smooth cubic interpolation
    const smoothstep = (e0: number, e1: number, x: number) => {
      const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };

    const loop = () => {
      ctx.clearRect(0, 0, w, h);
      const ht = heatRef.current;
      const en = enRef.current;

      // Speed: slow but visible when cold (snow), very fast when hot (embers)
      const baseSpeed = (0.35 + ht * ht * ht * 3.8) * (0.5 + en * 0.8);

      // Direction: +1 = falling (snow, cold), -1 = rising (embers, hot)
      // Transition window: heat 0.12 → 0.36
      const dir = 1 - smoothstep(0.12, 0.36, ht) * 2;

      // Drift: tight for snow, wide/chaotic for embers
      const driftScale = (0.08 + ht * 1.8) * en;

      // Particle size: bigger snowflakes when cold, smaller embers when hot
      const rScale = 1 + (1 - ht) * 0.8;

      // Color: cold = blue-white (snow), hot = orange-ember
      const cr = Math.round(215 + ht * 40); // 215 → 255
      const cg = Math.round(230 - ht * 60); // 230 → 170
      const cb = Math.round(255 - ht * 200); // 255 → 55

      for (const p of ps) {
        p.y += dir * p.sp * baseSpeed;
        p.x += p.drift * driftScale;

        if (p.y > h + 4) {
          p.y = -4;
          p.x = Math.random() * w;
        }
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w + 4;
        if (p.x > w + 4) p.x = -4;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * rScale, 0, 6.283);
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${p.a})`;
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
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 3,
      }}
    />
  );
}
