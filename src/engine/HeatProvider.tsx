import React, { createContext, useContext, useEffect, useRef, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TempData, TauriTemps } from "../types";

interface HeatCtxValue extends TempData {
  manual: number | null;
  setManual: (v: number | null) => void;
}

const HeatCtx = createContext<HeatCtxValue | null>(null);

export function useHeat(): HeatCtxValue {
  const ctx = useContext(HeatCtx);
  if (!ctx) throw new Error("useHeat must be used inside HeatProvider");
  return ctx;
}

const HIST_LEN = 56;
const POLL_MS = 500;

export function HeatProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<TempData>({
    cpuC: NaN,
    gpuC: NaN,
    cpuHist: [],
    gpuHist: [],
    load: 0,
  });
  const [manual, setManual] = useState<number | null>(null);
  const histRef = useRef<{ c: number[]; g: number[] }>({ c: [], g: [] });
  const loggedRef = useRef(false);

  useEffect(() => {
    let stop = false;

    const poll = async () => {
      if (stop) return;
      try {
        const temps = await invoke<TauriTemps>("get_temps");
        const cpuC = temps.cpu_c ?? NaN;
        const gpuC = temps.gpu_c ?? NaN;

        // Log sources once on first live reading
        if (temps.live && !loggedRef.current) {
          loggedRef.current = true;
          console.log(
            `[Fervent] CPU: ${isFinite(cpuC) ? cpuC.toFixed(1) + "°" : "—"} (${temps.cpu_source || "none"})` +
            `  GPU: ${isFinite(gpuC) ? gpuC.toFixed(1) + "°" : "—"} (${temps.gpu_source || "none"})`
          );
        }

        if (isFinite(cpuC)) {
          histRef.current.c.push(cpuC);
          if (histRef.current.c.length > HIST_LEN) histRef.current.c.shift();
        }
        if (isFinite(gpuC)) {
          histRef.current.g.push(gpuC);
          if (histRef.current.g.length > HIST_LEN) histRef.current.g.shift();
        }

        const known = [cpuC, gpuC].filter(isFinite);
        const load = known.length
          ? Math.max(0, Math.min(1, (Math.max(...known) - 36) / 53))
          : 0;

        setData({
          cpuC,
          gpuC,
          cpuHist: histRef.current.c.slice(),
          gpuHist: histRef.current.g.slice(),
          load,
        });
      } catch {
        // Tauri not available (browser dev mode) — keep last values
      }
      if (!stop) setTimeout(poll, POLL_MS);
    };

    poll();
    return () => { stop = true; };
  }, []);

  const api = useMemo<HeatCtxValue>(
    () => ({ ...data, manual, setManual }),
    [data, manual]
  );

  return <HeatCtx.Provider value={api}>{children}</HeatCtx.Provider>;
}
