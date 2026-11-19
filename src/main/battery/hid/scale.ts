import type {
  BatteryCalibrationProfile,
  BatteryReading,
} from "../../../shared/battery-types";

export function toPercent(
  raw: number,
  profile: Pick<BatteryCalibrationProfile, "scaleMin" | "scaleMax">,
): number {
  if (profile.scaleMax === profile.scaleMin) return Math.max(0, Math.min(100, raw));
  const percent = ((raw - profile.scaleMin) / (profile.scaleMax - profile.scaleMin)) * 100;
  return Math.max(0, Math.min(100, Math.round(percent)));
}

export function frameToReading(
  frame: number[],
  profile: BatteryCalibrationProfile,
): BatteryReading | null {
  const raw = frame[profile.byteOffset];
  if (typeof raw !== "number") return null;
  if (frame.slice(1).every((byte) => byte === 0)) return null;
  return { capacity: toPercent(raw, profile), charging: null, voltageMv: null };
}
