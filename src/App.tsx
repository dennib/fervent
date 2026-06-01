import React, { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { HeatProvider } from "./engine/HeatProvider";
import { WidgetConsole } from "./widgets/WidgetConsole";

function DebugSensors() {
  useEffect(() => {
    // Log all detected sensor labels once on startup (visible in DevTools console)
    setTimeout(async () => {
      const [items, errs] = await Promise.all([
        invoke<{ label: string; temp: number | null }[]>("get_component_labels").catch(() => []),
        invoke<string[]>("get_sensor_errors").catch(() => []),
      ]);
      console.group("[Fervent] All thermal zones");
      if (items.length === 0) console.warn("(none found)");
      items.forEach((c) => console.log(`${c.label}: ${c.temp?.toFixed(1) ?? "n/a"}°`));
      console.groupEnd();
      if (errs.length > 0) {
        console.group("[Fervent] Sensor errors");
        errs.forEach((e) => console.warn(e));
        console.groupEnd();
      }
    }, 2000);
  }, []);
  return null;
}

export default function App() {
  return (
    <HeatProvider>
      <DebugSensors />
      {/* Full-viewport transparent container; border-radius handled inside the widget */}
      <div style={{ position: "fixed", inset: 0, borderRadius: 22, overflow: "hidden" }}>
        <WidgetConsole mood="notturno" reading="numeri" energy={0.6} menu="alto" />
      </div>
    </HeatProvider>
  );
}
