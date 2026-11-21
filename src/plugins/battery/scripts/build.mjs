import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "resources", "SystemBatteries.cs");
const output = join(root, "resources", "system-batteries.exe");
const compiler = join(
  process.env.WINDIR || "C:\\Windows",
  "Microsoft.NET",
  "Framework64",
  "v4.0.30319",
  "csc.exe",
);

if (process.platform !== "win32" || !existsSync(compiler)) {
  console.log("battery helper: C# compiler unavailable, using PowerShell fallback");
  process.exit(0);
}

if (existsSync(output) && statSync(output).mtimeMs >= statSync(source).mtimeMs) {
  process.exit(0);
}

execFileSync(
  compiler,
  [
    "/nologo",
    "/optimize+",
    "/target:exe",
    "/platform:anycpu",
    `/out:${output}`,
    source,
  ],
  { stdio: "inherit" },
);
console.log(`battery helper: wrote ${relative(root, output)}`);
