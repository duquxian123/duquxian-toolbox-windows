import type { BatteryDevice, BatteryDeviceRoute } from "../shared/types";

const ADDRESS = /^[0-9a-f]{12}$/;

export function address(value: unknown): string | null {
  const text = String(value ?? "").toLowerCase();
  return ADDRESS.test(text) ? `mac:${text}` : null;
}

export function identityOf(device: Partial<BatteryDevice> & { serialNumber?: string }): string | null {
  if (device.identity) return device.identity;
  const id = String(device.id ?? "").toLowerCase();
  const windows = /dev_([0-9a-f]{12})/.exec(id);
  if (windows) return `mac:${windows[1]}`;
  const serial = device.serialNumber === undefined
    ? id.split(":")[2] ?? ""
    : device.serialNumber.toLowerCase();
  return address(serial);
}

const isWindowsRoute = (id: string) => /^(bt|xinput):/.test(id);

export function routesOf(device: BatteryDevice): BatteryDeviceRoute[] {
  const routes: BatteryDeviceRoute[] = [
    { id: device.id, driverId: device.driverId, profile: device.profile ?? null },
    ...(device.links ?? []),
  ];
  return routes.sort((a, b) => Number(isWindowsRoute(a.id)) - Number(isWindowsRoute(b.id)));
}
