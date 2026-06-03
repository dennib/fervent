// FerventSensor — long-lived LHM temperature reader.
// Streams one JSON line per 500ms to stdout.
// Requires administrator privileges (for WinRing0 kernel driver).
//
// Output schema (newline-delimited JSON):
//   { "cpu_c": <number|null>, "gpu_c": <number|null>,
//     "cpu_name": <string>, "gpu_name": <string>,
//     "ok": <bool>, "error": <string|null> }

using System.Text.Json;
using LibreHardwareMonitor.Hardware;

// UpdateVisitor: refreshes all hardware sensors in the tree.
class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer c) => c.Traverse(this);
    public void VisitHardware(IHardware h)
    {
        h.Update();
        foreach (var sub in h.SubHardware)
            sub.Accept(this);
    }
    public void VisitSensor(ISensor s) { }
    public void VisitParameter(IParameter p) { }
}

class Program
{
    static int Main()
    {
        var computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
        };

        try
        {
            computer.Open(); // loads WinRing0 driver — needs admin
        }
        catch (Exception ex)
        {
            // Emit the error but keep running; some CPU info may still be accessible
            Emit(null, null, "", "", false, $"open_failed: {ex.Message}");
        }

        var visitor = new UpdateVisitor();

        while (true)
        {
            try
            {
                computer.Accept(visitor); // refresh all sensor values

                double? cpu = null;
                string cpuName = "";
                double? gpu = null;
                string gpuName = "";

                foreach (var hw in computer.Hardware)
                {
                    if (hw.HardwareType == HardwareType.Cpu)
                    {
                        double? pkg = null;    // "CPU Package" sensor
                        double? coreMax = null; // max of individual core sensors

                        foreach (var s in hw.Sensors)
                        {
                            if (s.SensorType != SensorType.Temperature || s.Value is not float v)
                                continue;

                            var n = s.Name;
                            if (n.Contains("Package", StringComparison.OrdinalIgnoreCase))
                            {
                                if (pkg == null || v > pkg) pkg = v;
                            }
                            else if (!n.Contains("Distance", StringComparison.OrdinalIgnoreCase)
                                  && !n.Contains("Tjmax",    StringComparison.OrdinalIgnoreCase)
                                  && !n.Contains("TjMax",    StringComparison.OrdinalIgnoreCase))
                            {
                                // individual core or aggregate sensor
                                if (coreMax == null || v > coreMax) coreMax = v;
                            }
                        }

                        // Prefer "Package" temperature; fall back to max core
                        var pick = pkg ?? coreMax;
                        if (pick != null && (cpu == null || pick > cpu))
                        {
                            cpu = pick;
                            cpuName = pkg != null ? "CPU Package" : "CPU Core Max";
                        }
                    }
                    else if (hw.HardwareType is HardwareType.GpuNvidia
                                             or HardwareType.GpuAmd
                                             or HardwareType.GpuIntel)
                    {
                        double? core = null;
                        foreach (var s in hw.Sensors)
                        {
                            if (s.SensorType != SensorType.Temperature || s.Value is not float v)
                                continue;

                            var n = s.Name;
                            if (n.Equals("GPU Core", StringComparison.OrdinalIgnoreCase))
                            {
                                // Preferred: exact "GPU Core" match
                                core = v;
                                break;
                            }
                            if (core == null
                                && n.Contains("GPU", StringComparison.OrdinalIgnoreCase)
                                && !n.Contains("Hot",      StringComparison.OrdinalIgnoreCase)
                                && !n.Contains("Junction", StringComparison.OrdinalIgnoreCase))
                            {
                                core = v;
                            }
                        }
                        // First discrete GPU wins
                        if (gpu == null && core != null)
                        {
                            gpu = core;
                            gpuName = "GPU Core";
                        }
                    }
                }

                bool ok = cpu != null || gpu != null;
                Emit(cpu, gpu, cpuName, gpuName, ok, null);
            }
            catch (Exception ex)
            {
                Emit(null, null, "", "", false, $"poll_failed: {ex.Message}");
            }

            Thread.Sleep(500);
        }
    }

    static readonly JsonSerializerOptions s_opts = new() { PropertyNamingPolicy = null };

    static void Emit(double? cpu, double? gpu, string cpuName, string gpuName, bool ok, string? error)
    {
        var payload = new SensorPayload
        {
            cpu_c    = cpu,
            gpu_c    = gpu,
            cpu_name = cpuName,
            gpu_name = gpuName,
            ok       = ok,
            error    = error,
        };
        Console.WriteLine(JsonSerializer.Serialize(payload, s_opts));
        Console.Out.Flush();
    }
}

// Explicit class avoids anonymous-type reflection issues with PublishSingleFile
class SensorPayload
{
    public double? cpu_c    { get; set; }
    public double? gpu_c    { get; set; }
    public string  cpu_name { get; set; } = "";
    public string  gpu_name { get; set; } = "";
    public bool    ok       { get; set; }
    public string? error    { get; set; }
}
