export type TempBand = "cold" | "cool" | "warm" | "hot";
export type AtmosferaMood = "notturno" | "vetro" | "minimal";
export type ReadingMode = "numeri" | "anelli" | "provette";
export type MenuMode = "sinistra" | "alto" | "scomparsa";

export interface TempData {
  /** NaN when sensor not available */
  cpuC: number;
  /** NaN when sensor not available */
  gpuC: number;
  cpuHist: number[];
  gpuHist: number[];
  load: number;
}

/** Returned by the Tauri `get_temps` command */
export interface TauriTemps {
  /** null when sensor unavailable */
  cpu_c: number | null;
  /** null when sensor unavailable */
  gpu_c: number | null;
  live: boolean;
  cpu_source: string;
  gpu_source: string;
}
