import { Notification } from "electron";
import type { BatteryDevice } from "../shared/types";
import type { BatteryStore } from "./store";

const CHARGING_QUIET_MS = 5 * 60 * 1000;

export class BatteryNotifier {
  private readonly wasLow = new Map<string, boolean>();
  private readonly wasCharging = new Map<string, boolean>();
  private readonly chargingAlertAt = new Map<string, number>();

  constructor(
    private readonly store: BatteryStore,
    private readonly onOpen: () => void,
  ) {}

  check(device: BatteryDevice): void {
    const reading = device.lastReading;
    if (!reading || device.online === false || typeof reading.capacity !== "number") return;
    const settings = this.store.getSettings();
    const capacity = reading.capacity;
    const charging = !!reading.charging;
    const name = device.customName || device.product || "外设";

    if (settings.notifyEnabled) {
      const threshold = typeof device.alertThreshold === "number"
        ? device.alertThreshold
        : settings.notifyThreshold;
      const low = capacity <= threshold && !charging;
      if (low && !this.wasLow.get(device.id)) {
        this.post("电量偏低", `${name} 剩余 ${capacity}%，建议充电。`);
      }
      this.wasLow.set(device.id, low);
    }

    const was = this.wasCharging.get(device.id);
    const now = Date.now();
    if (
      settings.notifyCharging &&
      was === false &&
      charging &&
      now - (this.chargingAlertAt.get(device.id) ?? 0) >= CHARGING_QUIET_MS
    ) {
      this.chargingAlertAt.set(device.id, now);
      this.post("正在充电", `${name} 正在充电，当前电量 ${capacity}%。`);
    }
    if (settings.notifyCharged && was && !charging && capacity >= 95) {
      this.post("充电完成", `${name} 已充满，当前电量 ${capacity}%。`);
    }
    this.wasCharging.set(device.id, charging);
  }

  reset(id: string): void {
    this.wasLow.delete(id);
    this.wasCharging.delete(id);
    this.chargingAlertAt.delete(id);
  }

  private post(title: string, body: string): void {
    if (!Notification.isSupported()) return;
    const notification = new Notification({ title, body });
    notification.on("click", this.onOpen);
    notification.show();
  }
}
