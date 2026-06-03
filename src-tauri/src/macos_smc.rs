// macOS SMC temperature reader — pure Rust IOKit FFI.
// No external tools, no extra processes, no third-party crates beyond libc.
// Supports both Intel Macs and Apple Silicon (M1/M2/M3/M4).
//
// Architecture:
//   • Opens the AppleSMC IOKit service once per TempReader lifetime.
//   • Reads temperature keys via IOConnectCallStructMethod (selector 2).
//   • Decodes sp78 (fixed-point 7.8) and flt (IEEE 754) data types.
//   • Tries a priority list of keys: Intel first, Apple Silicon second.

use std::ffi::CString;
use std::mem;

// ── Platform types ────────────────────────────────────────────────────────────

type IoReturn  = i32;
type IoService = u32; // mach_port_t is u32 even on 64-bit macOS
type IoConnect = u32;

const KERN_SUCCESS:            IoReturn = 0;
const IO_MASTER_PORT_DEFAULT:  u32      = 0; // kIOMasterPortDefault

// SMC command indices
const KERNEL_INDEX_SMC:     u32 = 2;
const SMC_CMD_READ_BYTES:   u8  = 5;
const SMC_CMD_READ_KEY_INFO: u8  = 9;

// SMC temperature data-type codes (4-char, big-endian u32)
const SP78: u32 = u32::from_be_bytes(*b"sp78"); // signed fixed-point 7.8
const FLT_: u32 = u32::from_be_bytes(*b"flt "); // IEEE 754 32-bit float

// ── SMC key data structures (must match the C layout byte-for-byte) ───────────
//
// Total layout (verified by const assertion below = 80 bytes):
//   offset  0: key              u32      (4)
//   offset  4: vers             [6]      (6, align 2)
//   [2 bytes implicit padding]
//   offset 12: p_limit_data     [16]     (16, align 4)
//   offset 28: key_info         [12]     (12, align 4 — u32/u32/u8 + 3 pad)
//   offset 40: result           u8
//   offset 41: status           u8
//   offset 42: data8            u8
//   [1 byte implicit padding]
//   offset 44: data32           u32
//   offset 48: bytes            [u8; 32]
//   total: 80 bytes

#[repr(C)]
#[derive(Clone, Copy)]
struct SmcKeyDataVers {
    major:    u8,
    minor:    u8,
    build:    u8,
    reserved: u8,
    release:  u16,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SmcKeyDataPLimitData {
    version:     u16,
    length:      u16,
    cpu_p_limit: u32,
    gpu_p_limit: u32,
    mem_p_limit: u32,
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SmcKeyDataKeyInfo {
    data_size:       u32,
    data_type:       u32,
    data_attributes: u8,
    // 3 bytes implicit padding (repr C aligns next field to 4 bytes)
}

#[repr(C)]
#[derive(Clone, Copy)]
struct SmcKeyData {
    key:          u32,
    vers:         SmcKeyDataVers,
    p_limit_data: SmcKeyDataPLimitData,
    key_info:     SmcKeyDataKeyInfo,
    result:       u8,
    status:       u8,
    data8:        u8,
    // 1 byte implicit padding
    data32:       u32,
    bytes:        [u8; 32],
}

// Compile-time layout check
const _: () = assert!(
    mem::size_of::<SmcKeyData>() == 80,
    "SmcKeyData layout mismatch — SMC calls will be corrupt"
);

impl SmcKeyData {
    #[inline]
    fn zeroed() -> Self {
        // Safety: all-zero bytes are valid for this plain-data struct
        unsafe { mem::zeroed() }
    }
}

// ── IOKit FFI ─────────────────────────────────────────────────────────────────

#[link(name = "IOKit", kind = "framework")]
extern "C" {
    fn IOServiceGetMatchingService(
        master_port: u32,
        matching:    *mut std::ffi::c_void,
    ) -> IoService;

    fn IOServiceMatching(name: *const std::ffi::c_char) -> *mut std::ffi::c_void;

    fn IOServiceOpen(
        service:     IoService,
        owning_task: u32,
        r#type:      u32,
        connect:     *mut IoConnect,
    ) -> IoReturn;

    fn IOConnectCallStructMethod(
        connection:         IoConnect,
        selector:           u32,
        input_struct:       *const SmcKeyData,
        input_struct_cnt:   usize,
        output_struct:      *mut SmcKeyData,
        output_struct_cnt:  *mut usize,
    ) -> IoReturn;

    fn IOServiceClose(connect: IoConnect) -> IoReturn;
    fn IOObjectRelease(object: u32) -> IoReturn;
}

// `mach_task_self_` is the global holding this process's Mach task port.
// The C macro `mach_task_self()` simply reads it.
extern "C" {
    static mach_task_self_: u32;
}

// ── SMC handle ────────────────────────────────────────────────────────────────

pub struct SmcHandle(IoConnect);

impl SmcHandle {
    /// Open the AppleSMC IOKit service. Returns None if unavailable.
    pub fn open() -> Option<Self> {
        unsafe {
            let name = CString::new("AppleSMC").ok()?;
            // IOServiceMatching returns a CFMutableDictionaryRef; ownership is
            // transferred to IOServiceGetMatchingService which releases it.
            let service = IOServiceGetMatchingService(
                IO_MASTER_PORT_DEFAULT,
                IOServiceMatching(name.as_ptr()),
            );
            if service == 0 {
                return None;
            }
            let mut conn: IoConnect = 0;
            let ret = IOServiceOpen(service, mach_task_self_, 0, &mut conn);
            IOObjectRelease(service);
            if ret != KERN_SUCCESS {
                return None;
            }
            Some(SmcHandle(conn))
        }
    }

    /// Read a single SMC temperature key and return degrees Celsius.
    /// Returns None if the key doesn't exist or the data type is unsupported.
    pub fn read_temp(&self, key: [u8; 4]) -> Option<f64> {
        unsafe {
            // Step 1: query key info to get data size and data type
            let mut inp = SmcKeyData::zeroed();
            let mut out = SmcKeyData::zeroed();
            inp.key   = u32::from_be_bytes(key);
            inp.data8 = SMC_CMD_READ_KEY_INFO;
            let mut sz = mem::size_of::<SmcKeyData>();

            let r = IOConnectCallStructMethod(
                self.0, KERNEL_INDEX_SMC,
                &inp, mem::size_of::<SmcKeyData>(),
                &mut out, &mut sz,
            );
            if r != KERN_SUCCESS || out.key_info.data_size == 0 {
                return None;
            }
            let data_type = out.key_info.data_type;
            let data_size = out.key_info.data_size;

            // Step 2: read the actual bytes
            let mut inp2 = SmcKeyData::zeroed();
            let mut out2 = SmcKeyData::zeroed();
            inp2.key                  = u32::from_be_bytes(key);
            inp2.data8                = SMC_CMD_READ_BYTES;
            inp2.key_info.data_size   = data_size;
            inp2.key_info.data_type   = data_type;
            let mut sz2 = mem::size_of::<SmcKeyData>();

            let r2 = IOConnectCallStructMethod(
                self.0, KERNEL_INDEX_SMC,
                &inp2, mem::size_of::<SmcKeyData>(),
                &mut out2, &mut sz2,
            );
            if r2 != KERN_SUCCESS {
                return None;
            }

            let b = &out2.bytes;
            let temp = match data_type {
                SP78 => {
                    // Signed fixed-point: 1 sign bit + 7 integer + 8 fractional
                    i16::from_be_bytes([b[0], b[1]]) as f64 / 256.0
                }
                FLT_ => {
                    f32::from_be_bytes([b[0], b[1], b[2], b[3]]) as f64
                }
                _ => return None, // unsupported encoding for this key
            };

            // Sanity-check: valid CPU/GPU range
            if temp > 0.0 && temp < 150.0 { Some(temp) } else { None }
        }
    }
}

impl Drop for SmcHandle {
    fn drop(&mut self) {
        unsafe {
            IOServiceClose(self.0);
        }
    }
}

// ── Temperature key lists ─────────────────────────────────────────────────────

/// CPU temperature keys in priority order.
///
/// Intel Macs:
///   TCXC — CPU Core Max (most accurate on newer Intel Macs)
///   TC0D — CPU Core 0 Die
///   TC0P — CPU Core 0 Proximity (case-mounted, slightly cooler)
///
/// Apple Silicon (M1/M2/M3/M4):
///   Tp09 — Performance-cluster temperature (most representative)
///   Tp0T — Performance-cluster (alternate key on some M-series)
///   Tp01 — Efficiency-cluster temperature
///   TaLP — Average die temperature (left die, available on M1 Pro/Max/Ultra)
///   TCXC — also present on some Apple Silicon Macs
const CPU_KEYS: &[[u8; 4]] = &[
    *b"TCXC",
    *b"TC0D",
    *b"TC0P",
    *b"Tp09",
    *b"Tp0T",
    *b"Tp01",
    *b"TaLP",
];

/// GPU temperature keys for Intel integrated graphics.
/// Apple Silicon GPU shares the same die as the CPU; its temp is read via
/// CPU keys above. Discrete GPU support is not attempted here.
const GPU_KEYS: &[[u8; 4]] = &[
    *b"TGDD", // GPU die (newer Intel)
    *b"TG0D", // GPU core die
    *b"TG0P", // GPU core proximity
];

// ── Public interface ──────────────────────────────────────────────────────────

/// Try to read CPU and GPU temperatures from SMC.
///
/// Returns `(cpu_c, gpu_c, cpu_source, gpu_source)`.
/// Any value may be `None` if the corresponding key is absent.
pub fn read_temps(smc: &SmcHandle) -> (Option<f64>, Option<f64>, String, String) {
    // CPU: first key that returns a valid reading wins
    let mut cpu_temp = None;
    let mut cpu_key_name = String::new();
    for &key in CPU_KEYS {
        if let Some(t) = smc.read_temp(key) {
            cpu_temp = Some(t);
            cpu_key_name = std::str::from_utf8(&key).unwrap_or("?").to_owned();
            break;
        }
    }

    // GPU: first matching key wins
    let mut gpu_temp = None;
    for &key in GPU_KEYS {
        if let Some(t) = smc.read_temp(key) {
            gpu_temp = Some(t);
            break;
        }
    }

    let cpu_src = if cpu_temp.is_some() {
        format!("SMC (IOKit) [{}]", cpu_key_name)
    } else {
        "SMC: no CPU key found".into()
    };
    let gpu_src = if gpu_temp.is_some() {
        "SMC (IOKit) GPU".into()
    } else {
        String::new()
    };

    (cpu_temp, gpu_temp, cpu_src, gpu_src)
}
