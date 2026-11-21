import type { BatterySettings } from "../shared/types";

export const DEFAULT_BATTERY_SETTINGS: BatterySettings = {
  pollIntervalSec: 60,
  density: "detailed",
  sortMode: "urgent",
  notifyEnabled: true,
  notifyThreshold: 20,
  notifyCharging: true,
  notifyCharged: false,
  trayEnabled: true,
};

export function sanitizeBatterySettings(
  value: unknown,
  fallback: BatterySettings = DEFAULT_BATTERY_SETTINGS,
): BatterySettings {
  const source = value && typeof value === "object"
    ? value as Partial<BatterySettings>
    : {};
  const interval = Number(source.pollIntervalSec);
  const threshold = Number(source.notifyThreshold);
  return {
    pollIntervalSec: Number.isFinite(interval)
      ? Math.max(10, Math.min(3600, Math.round(interval)))
      : fallback.pollIntervalSec,
    density: source.density === "compact" ? "compact" : "detailed",
    sortMode: source.sortMode === "manual" ? "manual" : "urgent",
    notifyEnabled: typeof source.notifyEnabled === "boolean"
      ? source.notifyEnabled
      : fallback.notifyEnabled,
    notifyThreshold: Number.isFinite(threshold)
      ? Math.max(5, Math.min(95, Math.round(threshold / 5) * 5))
      : fallback.notifyThreshold,
    notifyCharging: typeof source.notifyCharging === "boolean"
      ? source.notifyCharging
      : fallback.notifyCharging,
    notifyCharged: typeof source.notifyCharged === "boolean"
      ? source.notifyCharged
      : fallback.notifyCharged,
    trayEnabled: typeof source.trayEnabled === "boolean"
      ? source.trayEnabled
      : fallback.trayEnabled,
  };
}
