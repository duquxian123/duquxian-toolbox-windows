import { app, utilityProcess } from "electron";
import { join } from "node:path";
import type {
  BatteryCalibrationFrame,
  BatteryCalibrationProfile,
  BatteryReading,
} from "../../shared/types";
import type { BatteryLogicalDevice } from "./catalog";

const WORKER = join(app.getAppPath(), "out", "main", "battery-worker.js");
const WORKER_EXITED = "battery hid worker exited";

function workerExited(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(WORKER_EXITED);
}

type Pending = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

export class BatteryHidClient {
  private child: Electron.UtilityProcess | null = null;
  private sequence = 0;
  private workerError = "";
  private readonly pending = new Map<number, Pending>();

  enumerate(): Promise<BatteryLogicalDevice[]> {
    return this.call("enumerate", [], 8000) as Promise<BatteryLogicalDevice[]>;
  }

  async readBattery(
    driverId: string,
    device: BatteryLogicalDevice,
    profile: BatteryCalibrationProfile | null,
  ): Promise<BatteryReading> {
    const read = () => this.call("readBattery", [driverId, device, profile], 12000);
    try {
      return await read() as BatteryReading;
    } catch (error) {
      if (workerExited(error)) {
        return await read() as BatteryReading;
      }
      throw error;
    }
  }

  identify(driverId: string, device: BatteryLogicalDevice): Promise<string | null> {
    return this.call("identify", [driverId, device], 4000) as Promise<string | null>;
  }

  capture(device: BatteryLogicalDevice): Promise<BatteryCalibrationFrame[]> {
    return this.call("capture", [device], 45000)
      .finally(() => this.kill()) as Promise<BatteryCalibrationFrame[]>;
  }

  stop(): void {
    this.kill();
    this.rejectAll("battery hid client stopped");
  }

  private spawn(): void {
    const child = utilityProcess.fork(WORKER, [], { stdio: "pipe" });
    this.child = child;
    this.workerError = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      this.workerError = `${this.workerError}${chunk.toString()}`.slice(-2000);
    });
    child.on("message", (message: unknown) => {
      const response = message as { id?: number; ok?: boolean; result?: unknown; error?: string };
      if (typeof response.id !== "number") return;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new Error(response.error || "battery HID request failed"));
    });
    child.on("exit", (code) => {
      if (this.child !== child) return;
      this.child = null;
      const detail = this.workerError.trim();
      this.rejectAll(
        `${WORKER_EXITED} (${code})${detail ? `: ${detail}` : ""}`,
      );
    });
  }

  private call(command: string, args: unknown[], timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.child) {
        try {
          this.spawn();
        } catch (error) {
          reject(error);
          return;
        }
      }
      const id = ++this.sequence;
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`${command} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child!.postMessage({ id, cmd: command, args });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  private kill(): void {
    if (this.child) {
      try {
        this.child.kill();
      } catch {
        // already gone
      }
      this.child = null;
    }
  }

  private rejectAll(reason: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.pending.clear();
  }
}
