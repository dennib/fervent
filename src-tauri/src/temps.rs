use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

// macOS SMC reader — compiled only on macOS
#[cfg(target_os = "macos")]
mod macos_smc;

// ── Shared types ──────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Clone)]
pub struct Temps {
    /// None when no sensor is available or accessible
    pub cpu_c: Option<f64>,
    /// None when no sensor is available or accessible
    pub gpu_c: Option<f64>,
    pub live: bool,
    pub cpu_source: String,
    pub gpu_source: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ComponentInfo {
    pub label: String,
    pub temp: Option<f64>,
}

// ── Windows ───────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn tenths_kelvin_to_c(tk: u32) -> f64 {
    (tk as f64 / 10.0) - 273.15
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug)]
struct AcpiThermalZone {
    #[serde(rename = "CurrentTemperature")]
    current_temperature: u32,
    #[serde(rename = "InstanceName")]
    instance_name: String,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug)]
struct OhmSensor {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Value")]
    value: f32,
    #[serde(rename = "Parent")]
    parent: String,
}

#[cfg(target_os = "windows")]
#[derive(Deserialize, Debug)]
struct ThermalZonePerfData {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "HighPrecisionTemperature")]
    high_precision_temperature: u64,
}

// ── WMI reader functions (Windows fallback tier) ──────────────────────────────

#[cfg(target_os = "windows")]
fn read_thermal_perf(conn: &wmi::WMIConnection) -> Option<(f64, Vec<ComponentInfo>)> {
    let zones: Vec<ThermalZonePerfData> = conn
        .raw_query(
            "SELECT Name, HighPrecisionTemperature \
             FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation",
        )
        .ok()?;
    if zones.is_empty() {
        return None;
    }

    let labels: Vec<ComponentInfo> = zones
        .iter()
        .map(|z| ComponentInfo {
            label: format!("ThermalZone\\{}", z.name),
            temp: Some(tenths_kelvin_to_c(z.high_precision_temperature as u32)),
        })
        .collect();

    let cpu = zones
        .iter()
        .filter(|z| {
            let n = z.name.to_lowercase();
            !n.contains("amb")
                && !n.contains("skin")
                && !n.contains("panel")
                && !n.contains("tpan")
                && !n.contains("tamb")
                && !n.contains("batt")
        })
        .map(|z| tenths_kelvin_to_c(z.high_precision_temperature as u32))
        .filter(|&t| t > 35.0 && t < 110.0)
        .fold(f64::NEG_INFINITY, f64::max);

    if cpu.is_finite() { Some((cpu, labels)) } else { None }
}

#[cfg(target_os = "windows")]
fn nvidia_smi_temp() -> Option<f64> {
    let out = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .lines()
        .next()?
        .trim()
        .parse::<f64>()
        .ok()
}

#[cfg(target_os = "windows")]
fn read_ohm(conn: &wmi::WMIConnection) -> Option<(f64, f64, Vec<ComponentInfo>)> {
    let sensors: Vec<OhmSensor> = conn
        .raw_query("SELECT Name, Value, Parent FROM Sensor WHERE SensorType='Temperature'")
        .ok()?;
    if sensors.is_empty() {
        return None;
    }

    let labels = sensors
        .iter()
        .map(|s| ComponentInfo {
            label: format!("{} ({})", s.name, s.parent),
            temp: Some(s.value as f64),
        })
        .collect();

    let is_real_temp = |s: &&OhmSensor| {
        let n = s.name.to_lowercase();
        !n.contains("distance") && !n.contains("tjmax") && !n.contains("hot spot")
    };

    let cpu = sensors
        .iter()
        .filter(is_real_temp)
        .filter(|s| {
            let n = s.name.to_lowercase();
            let p = s.parent.to_lowercase();
            (n.contains("package") || n.contains("core max") || n.contains("core average"))
                && (p.contains("cpu")
                    || p.contains("intel")
                    || p.contains("amd")
                    || p.contains("ryzen"))
        })
        .map(|s| s.value as f64)
        .fold(f64::NEG_INFINITY, f64::max);

    let cpu = if cpu.is_finite() {
        cpu
    } else {
        sensors
            .iter()
            .filter(is_real_temp)
            .filter(|s| {
                let p = s.parent.to_lowercase();
                p.contains("intelcpu") || p.contains("amdcpu") || p.contains("cpu")
            })
            .map(|s| s.value as f64)
            .fold(f64::NEG_INFINITY, f64::max)
    };

    let gpu = sensors
        .iter()
        .filter(is_real_temp)
        .filter(|s| {
            let p = s.parent.to_lowercase();
            p.contains("gpu")
                || p.contains("nvidia")
                || p.contains("geforce")
                || p.contains("amd")
                || p.contains("radeon")
        })
        .filter(|s| {
            let n = s.name.to_lowercase();
            n.contains("gpu core")
                || n == "gpu"
                || (n.contains("core") && !n.contains("hot"))
        })
        .map(|s| s.value as f64)
        .fold(f64::NEG_INFINITY, f64::max);

    let cpu_c = if cpu.is_finite() { cpu } else { return None };
    let gpu_c = if gpu.is_finite() { gpu } else { cpu_c - 4.0 };
    Some((cpu_c, gpu_c.max(30.0), labels))
}

#[cfg(target_os = "windows")]
fn read_acpi(conn: &wmi::WMIConnection) -> Option<(f64, Vec<ComponentInfo>)> {
    let zones: Vec<AcpiThermalZone> = conn
        .raw_query(
            "SELECT CurrentTemperature, InstanceName FROM MSAcpi_ThermalZoneTemperature",
        )
        .ok()?;
    if zones.is_empty() {
        return None;
    }

    let labels = zones
        .iter()
        .map(|z| ComponentInfo {
            label: z.instance_name.clone(),
            temp: Some(tenths_kelvin_to_c(z.current_temperature)),
        })
        .collect();

    let max = zones
        .iter()
        .map(|z| tenths_kelvin_to_c(z.current_temperature))
        .filter(|&t| t > 0.0 && t < 120.0)
        .fold(f64::NEG_INFINITY, f64::max);

    if max.is_finite() { Some((max, labels)) } else { None }
}

// ── Sidecar JSON line schema ──────────────────────────────────────────────────

#[cfg(target_os = "windows")]
#[derive(Deserialize)]
struct SidecarLine {
    cpu_c:    Option<f64>,
    gpu_c:    Option<f64>,
    #[serde(default)]
    cpu_name: String,
    #[serde(default)]
    gpu_name: String,
    // `ok` is part of the sidecar JSON schema; we derive liveness from cpu_c/gpu_c instead
    #[allow(dead_code)]
    #[serde(default)]
    ok:       bool,
    #[serde(default)]
    error:    Option<String>,
}

// ── Sidecar path resolver ─────────────────────────────────────────────────────

/// Finds the fervent-sensor sidecar executable.
/// Checks next to the running exe first (release/bundle), then the Cargo
/// manifest binaries/ dir (dev mode — tauri dev doesn't copy externalBin).
#[cfg(target_os = "windows")]
fn sidecar_path() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;

    // 1. Next to the running executable (installed / tauri build)
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in &[
                "fervent-sensor-x86_64-pc-windows-msvc.exe",
                "fervent-sensor.exe",
            ] {
                let p = dir.join(name);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    // 2. src-tauri/binaries/ (tauri dev — sidecar is not copied)
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join("fervent-sensor-x86_64-pc-windows-msvc.exe");
    if dev.exists() {
        return Some(dev);
    }

    None
}

// ── ChildGuard — kills the sidecar process on drop ───────────────────────────

#[cfg(target_os = "windows")]
struct ChildGuard(std::process::Child);

#[cfg(target_os = "windows")]
impl Drop for ChildGuard {
    fn drop(&mut self) {
        // Best-effort kill; ignore errors (process may have already exited)
        let _ = self.0.kill();
        let _ = self.0.wait();
    }
}

// ── WMI fallback loop (verbatim current behaviour, relabelled) ─────────────────

#[cfg(target_os = "windows")]
fn wmi_fallback_loop(
    sh_temps:  Arc<Mutex<Temps>>,
    sh_labels: Arc<Mutex<Vec<ComponentInfo>>>,
    sh_errors: Arc<Mutex<Vec<String>>>,
) {
    use wmi::{COMLibrary, WMIConnection};

    let mut errors: Vec<String> = sh_errors.lock().unwrap().clone();

    let com = match COMLibrary::new() {
        Ok(c) => c,
        Err(e) => {
            errors.push(format!("WMI fallback: COM init failed: {e}"));
            *sh_errors.lock().unwrap() = errors;
            return;
        }
    };

    let ohm_conn = WMIConnection::with_namespace_path(
        "root\\LibreHardwareMonitor",
        com.clone(),
    )
    .ok()
    .or_else(|| {
        WMIConnection::with_namespace_path("root\\OpenHardwareMonitor", com.clone()).ok()
    });

    if ohm_conn.is_none() {
        errors.push("LHM/OHM WMI namespace not found".into());
    }

    let acpi_conn = WMIConnection::with_namespace_path("root\\wmi", com.clone()).ok();
    if acpi_conn.is_none() {
        errors.push("root\\wmi namespace inaccessible".into());
    }

    let cimv2_conn = WMIConnection::with_namespace_path("root\\cimv2", com).ok();
    if cimv2_conn.is_none() {
        errors.push("root\\cimv2 namespace inaccessible".into());
    }

    *sh_errors.lock().unwrap() = errors;

    loop {
        let mut cpu_c: Option<f64> = None;
        let mut gpu_c: Option<f64> = None;
        let mut cpu_source = String::new();
        let mut gpu_source = String::new();
        let mut labels: Vec<ComponentInfo> = Vec::new();
        let mut live = false;

        // Priority 1: LHM/OHM via WMI (requires external LHM running)
        if let Some(ref conn) = ohm_conn {
            if let Some((c, g, lv)) = read_ohm(conn) {
                cpu_c = Some(c);
                gpu_c = Some(g);
                labels = lv;
                live = true;
                cpu_source = "LHM/OHM (WMI)".into();
                gpu_source = "LHM/OHM (WMI)".into();
            }
        }

        // Priority 2a: ACPI thermal zones
        if cpu_c.is_none() {
            if let Some(ref conn) = acpi_conn {
                if let Some((c, lv)) = read_acpi(conn) {
                    cpu_c = Some(c);
                    labels = lv;
                    live = true;
                    cpu_source = "ACPI WMI (fallback)".into();
                }
            }
        }

        // Priority 2b: Win32 Perf thermal zones (ambient — labelled as fallback)
        if cpu_c.is_none() {
            if let Some(ref conn) = cimv2_conn {
                if let Some((c, lv)) = read_thermal_perf(conn) {
                    cpu_c = Some(c);
                    if labels.is_empty() {
                        labels = lv;
                    }
                    live = true;
                    cpu_source = "WMI ThermalZone (fallback — may be ambient)".into();
                }
            }
        }

        // Priority 3: nvidia-smi for GPU
        if gpu_c.is_none() {
            if let Some(g) = nvidia_smi_temp() {
                gpu_c = Some(g);
                live = true;
                gpu_source = "nvidia-smi".into();
                labels.push(ComponentInfo {
                    label: "GPU (nvidia-smi)".into(),
                    temp: Some(g),
                });
            }
        }

        // Derive GPU from CPU if still missing
        if gpu_c.is_none() {
            if let Some(c) = cpu_c {
                gpu_c = Some((c - 4.0).max(30.0));
                gpu_source = format!("estimated from CPU ({})", cpu_source);
            }
        }

        *sh_temps.lock().unwrap() = Temps {
            cpu_c,
            gpu_c,
            live,
            cpu_source,
            gpu_source,
        };
        *sh_labels.lock().unwrap() = labels;

        thread::sleep(Duration::from_millis(500));
    }
}

// ── Windows primary loop — sidecar first, WMI fallback ───────────────────────

#[cfg(target_os = "windows")]
fn windows_loop(
    sh_temps:  Arc<Mutex<Temps>>,
    sh_labels: Arc<Mutex<Vec<ComponentInfo>>>,
    sh_errors: Arc<Mutex<Vec<String>>>,
) {
    use std::io::{BufRead, BufReader};
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};

    match sidecar_path() {
        None => {
            sh_errors.lock().unwrap().push(
                "fervent-sensor.exe not found; run 'yarn build:sidecar' once, then restart. \
                 Falling back to WMI."
                    .into(),
            );
        }
        Some(path) => {
            let spawn_result = Command::new(&path)
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .stdin(Stdio::null())
                // CREATE_NO_WINDOW: prevents a console window flashing on screen
                .creation_flags(0x0800_0000)
                .spawn();

            match spawn_result {
                Err(e) => {
                    sh_errors.lock().unwrap().push(format!(
                        "sidecar spawn failed: {e}; falling back to WMI"
                    ));
                }
                Ok(mut child) => {
                    // Take stdout BEFORE moving child into the guard (borrow rules)
                    let stdout = child.stdout.take().expect("stdout is piped");
                    // ChildGuard owns the Child; Drop kills the process on exit
                    let _guard = ChildGuard(child);

                    let reader = BufReader::new(stdout);
                    let mut null_streak: u32 = 0; // consecutive ticks with cpu_c = null

                    for line in reader.lines() {
                        let line = match line {
                            Ok(l) => l,
                            Err(_) => break, // pipe closed → fall through to WMI
                        };

                        let parsed: SidecarLine = match serde_json::from_str(&line) {
                            Ok(p) => p,
                            Err(_) => continue, // skip malformed line
                        };

                        // Track consecutive null-cpu to detect "not elevated"
                        let cpu_source = if parsed.cpu_c.is_some() {
                            null_streak = 0;
                            if parsed.cpu_name.is_empty() {
                                "LHM sidecar".into()
                            } else {
                                format!("LHM sidecar ({})", parsed.cpu_name)
                            }
                        } else {
                            null_streak += 1;
                            if null_streak >= 6 {
                                // ~3 seconds of null — driver likely not loaded
                                "no CPU temp — run as administrator".into()
                            } else {
                                "LHM sidecar (warming up)".into()
                            }
                        };

                        let gpu_c = parsed.gpu_c.or_else(|| {
                            parsed.cpu_c.map(|c| (c - 4.0).max(30.0))
                        });
                        let gpu_source = if parsed.gpu_c.is_some() {
                            if parsed.gpu_name.is_empty() {
                                "LHM sidecar".into()
                            } else {
                                format!("LHM sidecar ({})", parsed.gpu_name)
                            }
                        } else if parsed.cpu_c.is_some() {
                            "estimated from CPU (LHM)".into()
                        } else {
                            String::new()
                        };

                        let live = parsed.cpu_c.is_some() || parsed.gpu_c.is_some();

                        let mut labels = Vec::new();
                        if let Some(c) = parsed.cpu_c {
                            labels.push(ComponentInfo {
                                label: format!("{} (LHM sidecar)", parsed.cpu_name),
                                temp: Some(c),
                            });
                        }
                        if let Some(g) = parsed.gpu_c {
                            labels.push(ComponentInfo {
                                label: format!("{} (LHM sidecar)", parsed.gpu_name),
                                temp: Some(g),
                            });
                        }

                        *sh_temps.lock().unwrap() = Temps {
                            cpu_c: parsed.cpu_c,
                            gpu_c,
                            live,
                            cpu_source,
                            gpu_source,
                        };
                        *sh_labels.lock().unwrap() = labels;

                        if let Some(err) = parsed.error {
                            if !err.is_empty() {
                                sh_errors.lock().unwrap().push(format!("sidecar: {err}"));
                            }
                        }
                    }

                    // Sidecar pipe closed (crashed / exited) — fall through to WMI
                    sh_errors
                        .lock()
                        .unwrap()
                        .push("sidecar exited unexpectedly; falling back to WMI".into());
                }
            }
        }
    }

    // ── WMI fallback ──────────────────────────────────────────────────────────
    wmi_fallback_loop(sh_temps, sh_labels, sh_errors);
}

// ── Linux loop — hwmon via sysinfo ───────────────────────────────────────────

#[cfg(target_os = "linux")]
fn linux_loop(
    sh_temps:  Arc<Mutex<Temps>>,
    sh_labels: Arc<Mutex<Vec<ComponentInfo>>>,
    _sh_errors: Arc<Mutex<Vec<String>>>,
) {
    use sysinfo::Components;

    let mut components = Components::new_with_refreshed_list();

    loop {
        // Re-discover and refresh all hwmon values from /sys/class/hwmon/
        components.refresh_list();

        let mut cpu = f64::NEG_INFINITY;
        let mut gpu = f64::NEG_INFINITY;
        let mut labels: Vec<ComponentInfo> = Vec::new();

        for c in &components {
            let t = c.temperature() as f64;
            if t <= 0.0 {
                continue; // invalid / unreadable sensor
            }
            let label = c.label().to_string();
            labels.push(ComponentInfo {
                label: label.clone(),
                temp: Some(t),
            });

            let l = label.to_lowercase();
            // CPU thermal zones: coretemp, k10temp (AMD), acpitz with Tctl/package label
            if l.contains("tctl")
                || l.contains("package")
                || l.contains("coretemp")
                || l.contains("k10temp")
                || l.contains("cpu")
                || l.contains("core")
            {
                cpu = cpu.max(t);
            }
            // GPU thermal zones: amdgpu, nouveau (NVIDIA open), radeon
            if l.contains("amdgpu")
                || l.contains("nouveau")
                || l.contains("radeon")
                || l.contains("gpu")
            {
                gpu = gpu.max(t);
            }
        }

        let cpu_c = cpu.is_finite().then_some(cpu);
        let gpu_c = if gpu.is_finite() {
            Some(gpu)
        } else {
            cpu_c.map(|c| (c - 4.0).max(30.0))
        };
        let live = cpu_c.is_some();

        *sh_temps.lock().unwrap() = Temps {
            cpu_c,
            gpu_c,
            live,
            cpu_source: if cpu_c.is_some() {
                "hwmon (sysinfo)".into()
            } else {
                "no hwmon sensor found".into()
            },
            gpu_source: if gpu.is_finite() {
                "hwmon (sysinfo)".into()
            } else if cpu_c.is_some() {
                "estimated from CPU".into()
            } else {
                String::new()
            },
        };
        *sh_labels.lock().unwrap() = labels;

        thread::sleep(Duration::from_millis(500));
    }
}

// ── macOS loop — SMC/IOKit ───────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn macos_loop(
    sh_temps:  Arc<Mutex<Temps>>,
    sh_labels: Arc<Mutex<Vec<ComponentInfo>>>,
    sh_errors: Arc<Mutex<Vec<String>>>,
) {
    let smc = match macos_smc::SmcHandle::open() {
        Some(h) => h,
        None => {
            sh_errors
                .lock()
                .unwrap()
                .push("SMC: failed to open AppleSMC IOKit service".into());
            loop {
                *sh_temps.lock().unwrap() = Temps {
                    cpu_c: None,
                    gpu_c: None,
                    live: false,
                    cpu_source: "SMC unavailable".into(),
                    gpu_source: String::new(),
                };
                thread::sleep(Duration::from_millis(500));
            }
        }
    };

    loop {
        let (cpu_c, gpu_c_raw, cpu_src, gpu_src_raw) = macos_smc::read_temps(&smc);

        // Derive GPU from CPU if no discrete GPU sensor was found
        let gpu_c = gpu_c_raw.or_else(|| cpu_c.map(|c| (c - 4.0).max(30.0)));
        let gpu_source = if gpu_c_raw.is_some() {
            gpu_src_raw
        } else if cpu_c.is_some() {
            "estimated from CPU (SMC)".into()
        } else {
            String::new()
        };

        let live = cpu_c.is_some();

        let mut labels: Vec<ComponentInfo> = Vec::new();
        if let Some(c) = cpu_c {
            labels.push(ComponentInfo {
                label: cpu_src.clone(),
                temp: Some(c),
            });
        }
        if let Some(g) = gpu_c_raw {
            labels.push(ComponentInfo {
                label: "GPU (SMC)".into(),
                temp: Some(g),
            });
        }

        *sh_temps.lock().unwrap() = Temps {
            cpu_c,
            gpu_c,
            live,
            cpu_source: cpu_src,
            gpu_source,
        };
        *sh_labels.lock().unwrap() = labels;

        thread::sleep(Duration::from_millis(500));
    }
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

fn sensor_loop(
    sh_temps:  Arc<Mutex<Temps>>,
    sh_labels: Arc<Mutex<Vec<ComponentInfo>>>,
    sh_errors: Arc<Mutex<Vec<String>>>,
) {
    #[cfg(target_os = "windows")]
    windows_loop(sh_temps, sh_labels, sh_errors);

    #[cfg(target_os = "linux")]
    linux_loop(sh_temps, sh_labels, sh_errors);

    #[cfg(target_os = "macos")]
    macos_loop(sh_temps, sh_labels, sh_errors);

    // Unsupported OS: thread exits immediately; TempReader returns None forever.
    // (All three cfg blocks above loop forever on their respective platform.)
}

// ── Public API (UNCHANGED contract) ──────────────────────────────────────────

pub struct TempReader {
    latest: Arc<Mutex<Temps>>,
    labels: Arc<Mutex<Vec<ComponentInfo>>>,
    errors: Arc<Mutex<Vec<String>>>,
}

impl TempReader {
    pub fn new() -> Self {
        let latest = Arc::new(Mutex::new(Temps {
            cpu_c: None,
            gpu_c: None,
            live: false,
            cpu_source: String::new(),
            gpu_source: String::new(),
        }));
        let labels = Arc::new(Mutex::new(Vec::new()));
        let errors = Arc::new(Mutex::new(Vec::new()));

        let (sh_t, sh_l, sh_e) = (
            Arc::clone(&latest),
            Arc::clone(&labels),
            Arc::clone(&errors),
        );

        thread::Builder::new()
            .name("fervent-temps".into())
            .spawn(move || sensor_loop(sh_t, sh_l, sh_e))
            .expect("failed to spawn temps thread");

        Self { latest, labels, errors }
    }

    pub fn read(&self) -> Temps {
        self.latest.lock().unwrap().clone()
    }

    pub fn component_labels(&self) -> Vec<ComponentInfo> {
        self.labels.lock().unwrap().clone()
    }

    pub fn debug_errors(&self) -> Vec<String> {
        self.errors.lock().unwrap().clone()
    }
}
