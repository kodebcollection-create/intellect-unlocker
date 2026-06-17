#!/usr/bin/env node
/**
 * Pack the project source into a zip file you can download/share.
 *
 * Usage:
 *   node scripts/pack-source.mjs            # writes ./source.zip
 *   node scripts/pack-source.mjs my.zip     # custom output path
 *
 * Excludes: node_modules, .git, dist, .output, .vinxi, .vite, .cache,
 * .DS_Store, .env*, and any previously generated *.zip in the project root.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { resolve, basename } from "node:path";
import { platform } from "node:os";

const out = resolve(process.cwd(), process.argv[2] ?? "source.zip");
const root = process.cwd();

if (existsSync(out)) rmSync(out);

const excludes = [
  "node_modules",
  ".git",
  "dist",
  ".output",
  ".vinxi",
  ".vite",
  ".cache",
  ".DS_Store",
  ".env",
  ".env.*",
  "*.zip",
];

function tryZip() {
  // Use the system `zip` if available (macOS, Linux, WSL, Git Bash).
  const probe = spawnSync("zip", ["-v"], { stdio: "ignore" });
  if (probe.status !== 0) return false;
  const args = ["-r", out, ".", "-x", ...excludes.map((e) => `./${e}/*`), ...excludes.map((e) => `./${e}`)];
  execFileSync("zip", args, { stdio: "inherit", cwd: root });
  return true;
}

function powershellZip() {
  if (platform() !== "win32") return false;
  const ex = excludes.map((e) => `'${e}'`).join(",");
  const script = `
    $ErrorActionPreference='Stop';
    $excludes=@(${ex});
    $items = Get-ChildItem -Force | Where-Object {
      $name = $_.Name;
      -not ($excludes | Where-Object { $name -like $_ })
    };
    Compress-Archive -Path $items.FullName -DestinationPath '${out.replace(/'/g, "''")}' -Force;
  `;
  const r = spawnSync("powershell", ["-NoProfile", "-Command", script], { stdio: "inherit", cwd: root });
  return r.status === 0;
}

if (!tryZip() && !powershellZip()) {
  console.error(
    "Could not find `zip` or PowerShell. Install zip (e.g. `brew install zip`, `sudo apt install zip`) and retry.",
  );
  process.exit(1);
}

const size = (statSync(out).size / (1024 * 1024)).toFixed(2);
console.log(`\n✅ Created ${basename(out)} (${size} MB) at ${out}`);
