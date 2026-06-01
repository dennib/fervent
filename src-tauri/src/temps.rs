use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

#[derive(Debug, Serialize, Clone)]
pub struct Temps {
    /// None when no sensor available
    pub cpu_c: Option<f64>,
    /// None when no sensor available
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

// ── WMI structs ──────────────────────────────────────────────────────────────

#[derive(Deserialize, Debug)]
struct AcpiThermalZone {
    #[serde(rename = "CurrentTemperature")]
    current_temperature: u32,
    #[serde(rename = "InstanceName")]
    instance_name: String,
}

#[derive(Deserialize, Debug)]
struct OhmSensor {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "Value")]
    value: f32,
    #[serde(rename = "Parent")]
    parent: String,
}

fn tenths_kelvin_to_c(tk: u32) -> f64 {
    (tk as f64 / 10.0) - 273.15
}

// ── Win32_PerfFormattedData_Counters_ThermalZoneInformation (root\cimv2) ─────
// Works on Windows 8+ without admin. HighPrecisionTemperature is in
// tenths of Kelvin, same unit as MSAcpi_ThermalZoneTemperature.

#[derive(Deserialize, Debug)]
struct ThermalZonePerfData {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "HighPrecisionTemperature")]
    high_precision_temperature: u64,
}

fn read_thermal_perf(conn: &wmi::WMIConnection) -> Option<(f64, Vec<ComponentInfo>)> {
    let zones: Vec<ThermalZonePerfData> = conn
        .raw_query(
            "SELECT Name, HighPrecisionTemperature \
             FROM Win32_PerfFormattedData_Counters_ThermalZoneInformation",
        )
        .ok()?;
    if zones.is_empty() { return None; }

    // Expose all zones for debugging
    let labels: Vec<ComponentInfo> = zones
        .iter()
        .map(|z| ComponentInfo {
            label: format!("ThermalZone\\{}", z.name),
            temp: Some(tenths_kelvin_to_c(z.high_precision_temperature as u32)),
        })
        .collect();

    // CPU temperature must be > 35°C at any realistic load;
    // lower values are ambient/case sensors — discard them.
    // Also skip zones with names that are obviously non-CPU.
    let cpu = zones
        .iter()
        .filter(|z| {
            let n = z.name.to_lowercase();
            !n.contains("amb") && !n.contains("skin") && !n.contains("panel")
                && !n.contains("tpan") && !n.contains("tamb") && !n.contains("batt")
        })
        .map(|z| tenths_kelvin_to_c(z.high_precision_temperature as u32))
        .filter(|&t| t > 35.0 && t < 110.0)
        .fold(f64::NEG_INFINITY, f64::max);

    if cpu.is_finite() { Some((cpu, labels)) } else { None }
}

// ── nvidia-smi subprocess ─────────────────────────────────────────────────────

fn nvidia_smi_temp() -> Option<f64> {
    let out = std::process::Command::new("nvidia-smi")
        .args(["--query-gpu=temperature.gpu", "--format=csv,noheader,nounits"])
        .output()
        .ok()?;
    if !out.status.success() { return None; }
    String::from_utf8_lossy(&out.stdout)
        .trim()
        .lines()
        .next()?
        .trim()
        .parse::<f64>()
        .ok()
}

// ── WMI readers (connections are reused across ticks) ────────────────────────

fn read_ohm(conn: &wmi::WMIConnection) -> Option<(f64, f64, Vec<ComponentInfo>)> {
    let sensors: Vec<OhmSensor> = conn
        .raw_query("SELECT Name, Value, Parent FROM Sensor WHERE SensorType='Temperature'")
        .ok()?;
    if sensors.is_empty() { return None; }

    let labels = sensors
        .iter()
        .map(|s| ComponentInfo {
            label: format!("{} ({})", s.name, s.parent),
            temp: Some(s.value as f64),
        })
        .collect();

    // Exclude derived/headroom metrics — only real temperature readings
    let is_real_temp = |s: &&OhmSensor| {
        let n = s.name.to_lowercase();
        !n.contains("distance") && !n.contains("tjmax") && !n.contains("hot spot")
    };

    // CPU: prefer "Package" then "Core Max"/"Core Average", then individual cores
    let cpu = sensors.iter()
        .filter(is_real_temp)
        .filter(|s| {
            let n = s.name.to_lowercase();
            let p = s.parent.to_lowercase();
            (n.contains("package") || n.contains("core max") || n.contains("core average"))
                && (p.contains("cpu") || p.contains("intel") || p.contains("amd") || p.contains("ryzen"))
        })
        .map(|s| s.value as f64)
        .fold(f64::NEG_INFINITY, f64::max);

    // If no package/max sensor, fall back to max of individual cores
    let cpu = if cpu.is_finite() { cpu } else {
        sensors.iter()
            .filter(is_real_temp)
            .filter(|s| {
                let p = s.parent.to_lowercase();
                p.contains("intelcpu") || p.contains("amdcpu") || p.contains("cpu")
            })
            .map(|s| s.value as f64)
            .fold(f64::NEG_INFINITY, f64::max)
    };

    // GPU: prefer "GPU Core" (standard), exclude hot spot / junction
    let gpu = sensors.iter()
        .filter(is_real_temp)
        .filter(|s| {
            let p = s.parent.to_lowercase();
            p.contains("gpu") || p.contains("nvidia") || p.contains("geforce")
                || p.contains("amd") || p.contains("radeon")
        })
        .filter(|s| {
            let n = s.name.to_lowercase();
            n.contains("gpu core") || n == "gpu" || n.contains("core") && !n.contains("hot")
        })
        .map(|s| s.value as f64)
        .fold(f64::NEG_INFINITY, f64::max);

    let cpu_c = if cpu.is_finite() { cpu } else { return None };
    let gpu_c = if gpu.is_finite() { gpu } else { cpu_c - 4.0 };
    Some((cpu_c, gpu_c.max(30.0), labels))
}

fn read_acpi(conn: &wmi::WMIConnection) -> Option<(f64, Vec<ComponentInfo>)> {
    let zones: Vec<AcpiThermalZone> = conn
        .raw_query("SELECT CurrentTemperature, InstanceName FROM MSAcpi_ThermalZoneTemperature")
        .ok()?;
    if zones.is_empty() { return None; }

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

// ── Sensor loop (runs on its own thread; COM initialised once) ────────────────

fn sensor_loop(
    sh_temps: Arc<Mutex<Temps>>,
    sh_labels: Arc<Mutex<Vec<ComponentInfo>>>,
    sh_errors: Arc<Mutex<Vec<String>>>,
) {
    use wmi::{COMLibrary, WMIConnection};

    let mut errors: Vec<String> = Vec::new();

    // Initialise COM once for this thread (MTA, safe away from Tauri's STA main thread)
    let com = match COMLibrary::new() {
        Ok(c) => c,
        Err(e) => {
            errors.push(format!("COM init failed: {e}"));
            *sh_errors.lock().unwrap() = errors;
            return;
        }
    };

    // Try to open WMI connections once; reuse every tick
    let ohm_conn = WMIConnection::with_namespace_path("root\\LibreHardwareMonitor", com.clone())
        .ok()
        .or_else(|| WMIConnection::with_namespace_path("root\\OpenHardwareMonitor", com.clone()).ok());

    if ohm_conn.is_none() {
        errors.push("LHM/OHM WMI namespace not found".into());
    }

    let acpi_conn = WMIConnection::with_namespace_path("root\\wmi", com.clone()).ok();
    if acpi_conn.is_none() {
        errors.push("root\\wmi namespace inaccessible".into());
    }

    // root\cimv2 is always accessible; hosts Win32_Perf* thermal data
    let cimv2_conn = WMIConnection::with_namespace_path("root\\cimv2", com).ok();
    if cimv2_conn.is_none() {
        errors.push("root\\cimv2 namespace inaccessible".into());
    }

    *sh_errors.lock().unwrap() = errors.clone();

    loop {
        let mut cpu_c: Option<f64> = None;
        let mut gpu_c: Option<f64> = None;
        let mut cpu_source = String::new();
        let mut gpu_source = String::new();
        let mut labels: Vec<ComponentInfo> = Vec::new();
        let mut live = false;

        // Priority 1: OHM/LHM (most detailed)
        if let Some(ref conn) = ohm_conn {
            if let Some((c, g, lv)) = read_ohm(conn) {
                cpu_c = Some(c); gpu_c = Some(g); labels = lv; live = true;
                cpu_source = "LHM/OHM".into();
                gpu_source = "LHM/OHM".into();
            }
        }

        // Priority 2a: ACPI thermal zones (root\wmi)
        if cpu_c.is_none() {
            if let Some(ref conn) = acpi_conn {
                if let Some((c, lv)) = read_acpi(conn) {
                    cpu_c = Some(c); labels = lv; live = true;
                    cpu_source = "ACPI WMI".into();
                }
            }
        }

        // Priority 2b: Win32 Perf thermal zones (root\cimv2, no admin needed)
        if cpu_c.is_none() {
            if let Some(ref conn) = cimv2_conn {
                if let Some((c, lv)) = read_thermal_perf(conn) {
                    cpu_c = Some(c);
                    if labels.is_empty() { labels = lv; }
                    live = true;
                    cpu_source = "WMI ThermalZone".into();
                }
            }
        }

        // Priority 3: nvidia-smi for GPU
        if gpu_c.is_none() {
            if let Some(g) = nvidia_smi_temp() {
                gpu_c = Some(g); live = true; gpu_source = "nvidia-smi".into();
                labels.push(ComponentInfo { label: "GPU (nvidia-smi)".into(), temp: Some(g) });
            }
        }

        // Only derive GPU from CPU — never derive CPU from GPU
        if gpu_c.is_none() {
            if let Some(c) = cpu_c {
                gpu_c = Some((c - 4.0).max(30.0));
                gpu_source = format!("estimated from CPU ({})", cpu_source);
            }
        }

        *sh_temps.lock().unwrap() = Temps {
            cpu_c, gpu_c, live, cpu_source, gpu_source,
        };
        *sh_labels.lock().unwrap() = labels;

        thread::sleep(Duration::from_millis(500));
    }
}

// ── Public API ────────────────────────────────────────────────────────────────

pub struct TempReader {
    latest: Arc<Mutex<Temps>>,
    labels: Arc<Mutex<Vec<ComponentInfo>>>,
    errors: Arc<Mutex<Vec<String>>>,
}

impl TempReader {
    pub fn new() -> Self {
        let latest = Arc::new(Mutex::new(Temps {
            cpu_c: None, gpu_c: None, live: false,
            cpu_source: String::new(), gpu_source: String::new(),
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
