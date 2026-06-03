import React from "react";

export function TrafficLights() {
  const dot = (bg: string) => (
    <div style={{ width: 11, height: 11, borderRadius: "50%", background: bg }} />
  );
  return (
    <div style={{ display: "flex", gap: 7 }}>
      {dot("#ff5f57")}{dot("#febc2e")}{dot("#28c840")}
    </div>
  );
}
