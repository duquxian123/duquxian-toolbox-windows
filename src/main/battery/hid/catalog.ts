import * as HID from "node-hid";
import type { BatteryLiveDevice } from "../../../shared/battery-types";

export interface BatteryHidChannel {
  path: string;
  usagePage: number;
  usage: number;
  interface: number;
}

export interface BatteryLogicalDevice {
  id: string;
  vendorId: number;
  productId: number;
  product: string;
  manufacturer: string;
  serialNumber: string;
  channels: BatteryHidChannel[];
}

export async function listLogicalDevices(): Promise<BatteryLogicalDevice[]> {
  const raw = await HID.devicesAsync();
  const groups = new Map<string, BatteryLogicalDevice>();
  for (const info of raw) {
    const key = `${info.vendorId}:${info.productId}:${info.serialNumber || ""}`;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        vendorId: info.vendorId,
        productId: info.productId,
        product: (info.product || "Unknown device").replace(/_/g, " "),
        manufacturer: info.manufacturer || "",
        serialNumber: info.serialNumber || "",
        channels: [],
      });
    }
    groups.get(key)!.channels.push({
      path: info.path ?? "",
      usagePage: info.usagePage ?? 0,
      usage: info.usage ?? 0,
      interface: info.interface ?? 0,
    });
  }
  return Array.from(groups.values());
}

export function findChannel(
  device: BatteryLogicalDevice,
  usagePage: number,
  usage?: number,
): BatteryHidChannel | undefined {
  const onPage = device.channels.filter((channel) => channel.usagePage === usagePage);
  return onPage.find((channel) => usage === undefined || channel.usage === usage) ?? onPage[0];
}

export function toBatteryLiveDevices(devices: BatteryLogicalDevice[]): BatteryLiveDevice[] {
  return devices.map((device) => ({
    id: device.id,
    product: device.product,
    manufacturer: device.manufacturer,
    serialNumber: device.serialNumber,
    vendorId: device.vendorId,
    productId: device.productId,
    channelCount: device.channels.length,
    suggestedDriver: null,
  }));
}
