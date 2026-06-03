<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/png/Fervent-lockup-light@2x.png">
    <img src="public/brand/png/Fervent-lockup-dark@2x.png" width="320" alt="Fervent" />
  </picture>
</p>

<p align="center">
  <strong>A beautiful temperature monitor widget for your desktop</strong><br>
  Real-time CPU &amp; GPU thermal readings wrapped in an atmospheric interface<br>that breathes with your hardware.
</p>

<br>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2.x-24C8DB?logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React" />
  <img src="https://img.shields.io/badge/Rust-1.77+-CE422B?logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-555?logo=apple&logoColor=white" alt="Platform" />
  <img src="https://img.shields.io/badge/version-0.1.0-orange" alt="Version" />
</p>

<br>

<p align="center">
  <img src="design/screenshots/hero.png" width="720" alt="Fervent" />
</p>

<br>

---

## What is Fervent?

Fervent is a frameless desktop widget that shows CPU and GPU temperatures in real time. Unlike traditional system monitors, it makes thermal data feel alive — the background shifts between icy mountain peaks and glowing lava fields as your machine heats up, with particles, atmosphere, and color all responding to load.

It lives in your system tray and stays out of the way until you need it.

---

## Features

- **Live thermal readings** — CPU & GPU via native sensor APIs (no polling lag)
- **Atmospheric visuals** — Background transitions seamlessly across four biomes: cold, cool, warm, hot
- **Three display modes** — Large numbers with spark lines, radial gauge, or combined gauge + liquid tubes
- **Rolling history** — 5-minute spark lines show temperature trends at a glance
- **System tray** — Always-on temperatures without keeping the window open
- **°C / °F** — One-tap unit toggle
- **Frameless & transparent** — Sits naturally on any desktop without visual clutter

---

## Tech stack

| Layer | Technology |
|---|---|
| Shell | [Tauri 2](https://tauri.app) — Rust core, WebView frontend |
| UI | React 19 + TypeScript |
| Sensor — Windows | LibreHardwareMonitor sidecar + WMI fallback |
| Sensor — macOS | IOKit SMC via Rust FFI |
| Sensor — Linux | `hwmon` via `/sys/class/hwmon` |
| Build | Vite 6 + Yarn |

---

## Getting started

### Prerequisites

- [Rust](https://rustup.rs) 1.77+
- [Node.js](https://nodejs.org) 18+
- Yarn (`npm i -g yarn`)

### Run in development

```bash
yarn install
yarn tauri dev
```

### Build a release

```bash
yarn tauri build
```

> [!NOTE]
> On **Windows**, the sensor sidecar requires the LibreHardwareMonitor binary.
> Run `yarn build:sidecar` once before the first build to compile it.

---

## Sensor backends

| Platform | Method | Notes |
|---|---|---|
| Windows | LHM sidecar | Spawned as a privileged subprocess; falls back to WMI if unavailable |
| macOS | SMC via IOKit | Direct FFI, no extra dependencies |
| Linux | `/sys/class/hwmon` | Reads `temp*_input` files from kernel hwmon subsystem |

---

## License

MIT — © 2026 [Denni Bevilacqua](https://github.com/dennibevilacqua)
