import type {
  BatteryCalibrationProfile,
  BatteryDevice,
  BatteryDeviceRoute,
  BatteryReading,
} from "../shared/types";

export function batteryRouteDetails(
  id: string,
  card: BatteryDevice,
  route: BatteryDeviceRoute | null = null,
) {
  return {
    deviceId: id,
    name: card.customName || card.product || "无线外设",
    product: card.product,
    manufacturer: card.manufacturer,
    driverId: card.driverId,
    routeId: route?.id ?? id,
    routeDriverId: route?.driverId ?? card.driverId,
    profile: route?.profile ?? card.profile ?? null,
  };
}

export function batteryReadingDetails(
  id: string,
  card: BatteryDevice,
  reading: BatteryReading,
  route: BatteryDeviceRoute | null = null,
) {
  const raw = Array.isArray(reading.raw) ? reading.raw.slice() : null;
  return {
    ...batteryRouteDetails(id, card, route),
    capacity: reading.capacity,
    charging: reading.charging ?? null,
    voltageMv: reading.voltageMv ?? null,
    raw,
    rawHex: raw
      ? raw.map((byte) => byte.toString(16).padStart(2, "0")).join(" ")
      : null,
  };
}

export function outOfRangeRawPercent(
  reading: BatteryReading,
  profile: BatteryCalibrationProfile | null | undefined,
): number | null {
  if (!profile || !Array.isArray(reading.raw)) return null;
  const value = reading.raw[profile.byteOffset];
  return typeof value === "number" && (value < 0 || value > 100)
    ? value
    : null;
}
