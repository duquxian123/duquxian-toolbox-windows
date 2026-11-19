import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { batteryResourcePath } from "./paths";

export interface SystemBatteryDevice {
  id: string;
  name: string;
  kind: "bluetooth" | "xinput";
  capacity: number;
  connected: boolean;
}

const SCAN_TIMEOUT_MS = 20000;
const WATCH_EVERY_S = 10;
let watcher: ChildProcess | null = null;
let latest = new Map<string, SystemBatteryDevice>();
let seenAt = 0;

function command(every: number): [string, string[]] {
  const executable = batteryResourcePath("system-batteries.exe");
  if (existsSync(executable)) {
    return [
      executable,
      every ? ["--every", String(every), "--parent", String(process.pid)] : [],
    ];
  }
  const script = batteryResourcePath("system-batteries.ps1");
  return [
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      ...(every ? ["-Every", String(every), "-ParentId", String(process.pid)] : []),
    ],
  ];
}

function parseScan(line: string): SystemBatteryDevice[] | null {
  try {
    const list = JSON.parse(line);
    return (Array.isArray(list) ? list : [list]).filter(
      (device): device is SystemBatteryDevice =>
        !!device &&
        typeof device.id === "string" &&
        typeof device.name === "string" &&
        typeof device.capacity === "number" &&
        device.capacity >= 0 &&
        device.capacity <= 100,
    );
  } catch {
    return null;
  }
}

function remember(list: SystemBatteryDevice[]): void {
  latest = new Map(list.map((device) => [device.id, device]));
  seenAt = Date.now();
}

export function scanSystemBatteries(): Promise<SystemBatteryDevice[]> {
  if (
    process.platform !== "win32" ||
    (
      !existsSync(batteryResourcePath("system-batteries.exe")) &&
      !existsSync(batteryResourcePath("system-batteries.ps1"))
    )
  ) {
    return Promise.resolve([]);
  }
  const [file, args] = command(0);
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { windowsHide: true, timeout: SCAN_TIMEOUT_MS, encoding: "utf8" },
      (error, stdout) => {
        const list = error
          ? null
          : parseScan(stdout.trim().split(/\r?\n/).at(-1) ?? "");
        if (list) remember(list);
        resolve(list ?? []);
      },
    );
  });
}

export function startSystemBatteryWatcher(): void {
  if (watcher || process.platform !== "win32") return;
  const [file, args] = command(WATCH_EVERY_S);
  watcher = spawn(file, args, { windowsHide: true });
  let buffer = "";
  watcher.stdout?.setEncoding("utf8");
  watcher.stdout?.on("data", (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const list = parseScan(line);
      if (list) remember(list);
    }
  });
  watcher.on("error", () => { watcher = null; });
  watcher.on("exit", () => { watcher = null; });
}

export function stopSystemBatteryWatcher(): void {
  watcher?.kill();
  watcher = null;
}

export function getSystemBattery(id: string): SystemBatteryDevice | null {
  return latest.get(id) ?? null;
}

export function listSystemBatteries(): SystemBatteryDevice[] {
  return Array.from(latest.values());
}

export function hasSystemBatteryScan(): boolean {
  return seenAt > 0;
}

export function isSystemBatteryId(id: string): boolean {
  return /^(bt|xinput):/.test(id);
}
