import type { BatteryDevice, BatteryHistoryPoint } from "../../shared/battery-types";

const WOBBLE = 15;
const RECENT_READING_MS = 7 * 24 * 60 * 60 * 1000;

export function drainRatePerHour(history: BatteryHistoryPoint[] | undefined): number | null {
  if (!history || history.length < 2) return null;
  let totalDrop = 0;
  let totalHours = 0;
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    if (previous.ch || current.ch) continue;
    const drop = previous.c - current.c;
    const hours = (current.t - previous.t) / 3_600_000;
    if (drop < -WOBBLE || hours <= 0 || hours > 72) continue;
    totalDrop += drop;
    totalHours += hours;
  }
  if (totalDrop < 2 || totalHours < 0.25) return null;
  return totalDrop / totalHours;
}

export function estimateHoursLeft(
  history: BatteryHistoryPoint[] | undefined,
  capacity: number | null | undefined,
): number | null {
  if (capacity == null) return null;
  const rate = drainRatePerHour(history);
  return rate ? capacity / rate : null;
}

export function lastChargedAt(history: BatteryHistoryPoint[] | undefined): number | null {
  if (!history) return null;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].ch) return history[index].t;
    if (index > 0 && history[index].c > history[index - 1].c) return history[index].t;
  }
  return null;
}

export function hasRecentReading(device: BatteryDevice, now = Date.now()): boolean {
  return !!device.lastReadingAt && now - device.lastReadingAt < RECENT_READING_MS;
}

export function isBatteryOffline(device: BatteryDevice): boolean {
  return device.online === false;
}

export function isBatteryCharging(device: BatteryDevice): boolean {
  return !!device.lastReading?.charging && !isBatteryOffline(device);
}

export function offLabel(device: BatteryDevice): string | null {
  if (!isBatteryOffline(device)) return null;
  const error = device.lastError ?? "";
  if (!/\bis (off|not answering)$/i.test(error)) return null;
  return /^headset\b/i.test(error) ? "已关闭" : "休眠或已关闭";
}

export function urgencyCompare(a: BatteryDevice, b: BatteryDevice): number {
  const rank = (device: BatteryDevice) => {
    if (isBatteryOffline(device)) return 3;
    if (typeof device.lastReading?.capacity !== "number") return 2;
    return isBatteryCharging(device) ? 1 : 0;
  };
  return rank(a) - rank(b) ||
    (a.lastReading?.capacity ?? 0) - (b.lastReading?.capacity ?? 0) ||
    (a.order ?? 1e9) - (b.order ?? 1e9);
}
