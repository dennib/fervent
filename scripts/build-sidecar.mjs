#!/usr/bin/env node
/**
 * Build the FerventSensor .NET sidecar (Windows only).
 *
 * Output: src-tauri/binaries/fervent-sensor-x86_64-pc-windows-msvc.exe
 *
 * Prerequisites:
 *   - .NET 8 SDK (https://dotnet.microsoft.com/download)
 *
 * Usage:
 *   node scripts/build-sidecar.mjs        # or: yarn build:sidecar
 */

import { execSync }                          from 'child_process';
import { existsSync, copyFileSync, mkdirSync } from 'fs';
import { resolve, dirname }                  from 'path';
import { fileURLToPath }                     from 'url';
import os                                    from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root      = resolve(__dirname, '..');

// ── Platform guard ────────────────────────────────────────────────────────────
if (os.platform() !== 'win32') {
  console.log('[build-sidecar] Not on Windows — skipping sidecar build.');
  process.exit(0);
}

// ── .NET SDK check ────────────────────────────────────────────────────────────
let dotnetVer;
try {
  dotnetVer = execSync('dotnet --version', { encoding: 'utf8' }).trim();
} catch {
  console.error(
    '[build-sidecar] ERROR: dotnet not found on PATH.\n' +
    '  Install the .NET 8 SDK from https://dotnet.microsoft.com/download\n' +
    '  then re-run this command.'
  );
  process.exit(1);
}

const major = parseInt(dotnetVer.split('.')[0], 10);
if (isNaN(major) || major < 8) {
  console.error(
    `[build-sidecar] ERROR: .NET 8 SDK is required but found version ${dotnetVer}.\n` +
    '  Download from https://dotnet.microsoft.com/download'
  );
  process.exit(1);
}
console.log(`[build-sidecar] .NET SDK ${dotnetVer} — OK`);

// ── Paths ─────────────────────────────────────────────────────────────────────
const proj       = resolve(root, 'src-tauri', 'sidecar', 'FerventSensor', 'FerventSensor.csproj');
const publishDir = resolve(root, 'src-tauri', 'binaries', '_publish');
const binDir     = resolve(root, 'src-tauri', 'binaries');
// Tauri externalBin convention: basename + host-triple + .exe
const dst        = resolve(binDir, 'fervent-sensor-x86_64-pc-windows-msvc.exe');
const src        = resolve(publishDir, 'fervent-sensor.exe');

mkdirSync(binDir,     { recursive: true });
mkdirSync(publishDir, { recursive: true });

// ── Publish ───────────────────────────────────────────────────────────────────
console.log('[build-sidecar] Publishing FerventSensor (self-contained single-file)...');
execSync(
  [
    'dotnet', 'publish',
    `"${proj}"`,
    '-c', 'Release',
    '-r', 'win-x64',
    '--self-contained', 'true',
    '-p:PublishSingleFile=true',
    '-o', `"${publishDir}"`,
  ].join(' '),
  { stdio: 'inherit' }
);

if (!existsSync(src)) {
  console.error(`[build-sidecar] ERROR: Expected output not found: ${src}`);
  process.exit(1);
}

copyFileSync(src, dst);
console.log(`[build-sidecar] ✓ Done → ${dst}`);
