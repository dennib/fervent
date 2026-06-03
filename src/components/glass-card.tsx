import React from "react";

interface GlassCardProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  bg?: string;
  blur?: number;
  border?: number;
}

export function GlassCard({
  children,
  style,
  bg = "rgba(18,26,42,0.42)",
  blur = 26,
  border = 0.14,
}: GlassCardProps) {
  return (
    <div style={{
      borderRadius: 20, padding: 18, background: bg,
      backdropFilter: `blur(${blur}px) saturate(150%)`,
      WebkitBackdropFilter: `blur(${blur}px) saturate(150%)`,
      border: `0.5px solid rgba(255,255,255,${border})`,
      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16), 0 16px 44px rgba(0,0,0,0.34)",
      textAlign: "center",
      ...style,
    }}>
      {children}
    </div>
  );
}

export function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: 10.5, letterSpacing: 2.5,
      color: "rgba(255,255,255,0.55)", marginBottom: 12,
    }}>
      {children}
    </div>
  );
}
