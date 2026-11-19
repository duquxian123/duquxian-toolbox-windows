import type { BatteryHistoryPoint } from "../../shared/battery-types";

export const HISTORY_MAX_POINTS = 300;
export const HISTORY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const HISTORY_MIN_GAP_MS = 20 * 60 * 1000;

export function pushBatteryHistory(
  existing: BatteryHistoryPoint[] | undefined,
  capacity: number,
  charging: boolean,
  now: number,
): BatteryHistoryPoint[] {
  const history = Array.isArray(existing) ? existing.slice() : [];
  const last = history.at(-1);
  if (!last || last.c !== capacity || now - last.t >= HISTORY_MIN_GAP_MS) {
    history.push({ t: now, c: capacity, ch: charging ? 1 : 0 });
  }
  const cutoff = now - HISTORY_MAX_AGE_MS;
  const pruned = history.filter((point) => point.t >= cutoff);
  return pruned.slice(-HISTORY_MAX_POINTS);
}
