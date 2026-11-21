import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { batteryResourcePath } from "./paths";

const PYTHON_CANDIDATES = ["python", "python3", "py"];
const active = new Map<string, { child: ChildProcess }>();

export function startBatteryMonitor(
  id: string,
  onReading: (reading: { capacity: number; charging: null; voltageMv: null }) => void,
  onStatus: (state: "connected" | "disconnected" | "off" | "python-missing") => void,
): void {
  if (active.has(id)) return;
  const attempt = (index: number): void => {
    if (index >= PYTHON_CANDIDATES.length) {
      onStatus("python-missing");
      return;
    }
    let child: ChildProcess;
    try {
      child = spawn(
        PYTHON_CANDIDATES[index],
        [batteryResourcePath("headset_reader.py")],
        { windowsHide: true },
      );
    } catch {
      attempt(index + 1);
      return;
    }
    active.set(id, { child });
    let started = false;
    const release = () => {
      const entry = active.get(id);
      if (!entry || entry.child !== child) return false;
      active.delete(id);
      return true;
    };
    if (child.stdout) {
      createInterface({ input: child.stdout }).on("line", (line) => {
        try {
          const message = JSON.parse(line) as {
            event?: string;
            capacity?: number;
            state?: "connected" | "disconnected" | "off";
          };
          if (message.event === "ready") started = true;
          else if (message.event === "battery" && typeof message.capacity === "number") {
            onReading({ capacity: message.capacity, charging: null, voltageMv: null });
          } else if (message.event === "status" && message.state) {
            onStatus(message.state);
          }
        } catch {
          // Ignore malformed subprocess output.
        }
      });
    }
    child.on("error", () => {
      if (release()) attempt(index + 1);
    });
    child.on("exit", () => {
      if (release() && !started) attempt(index + 1);
    });
  };
  attempt(0);
}

export function stopBatteryMonitor(id: string): void {
  const entry = active.get(id);
  entry?.child.kill();
  active.delete(id);
}

export function isBatteryMonitorActive(id: string): boolean {
  return active.has(id);
}

export function stopAllBatteryMonitors(): void {
  for (const id of Array.from(active.keys())) stopBatteryMonitor(id);
}
