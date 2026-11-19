// @ts-nocheck
import * as session from "../session";
import { address } from "../../identity";

const SONY = 0x054c;
const DUALSENSE = new Set([0x0ce6, 0x0df2]);
const DUALSHOCK4 = new Set([0x05c4, 0x09cc, 0x0ba0]);
const ADAPTER = 0x0ba0;
const LISTEN_MS = 1500;
const FULL_REPORT = { id: 0x05, size: 41 };
const BLUETOOTH_HID = /00001124-0000-1000-8000-00805f9b34fb/i;
const isBluetooth = (channel) => BLUETOOTH_HID.test(channel.path);
const channelOf = (device) => device.channels.find(
  (channel) => channel.usagePage === 0x01 && channel.usage === 0x05,
);
const level = (units) => Math.min(100, units * 10 + 5);

export function matches(device) {
  return device.vendorId === SONY &&
    (DUALSENSE.has(device.productId) || DUALSHOCK4.has(device.productId)) &&
    !!channelOf(device);
}

export function parseDualSense(frame, bluetooth) {
  if (frame[0] !== (bluetooth ? 0x31 : 0x01)) return null;
  const status = frame[bluetooth ? 54 : 53];
  const units = status & 0x0f;
  const state = status >> 4;
  if (state === 0x0) return { capacity: level(units), charging: false };
  if (state === 0x1) return { capacity: level(units), charging: true };
  if (state === 0x2) return { capacity: 100, charging: true };
  return null;
}

export function parseDualShock4(frame, bluetooth, adapter = false) {
  if (frame[0] !== (bluetooth ? 0x11 : 0x01)) return null;
  if (adapter && !bluetooth && (frame[31] & 0x04)) return { off: true };
  const status = frame[bluetooth ? 32 : 30];
  const units = status & 0x0f;
  const cable = !!(status & 0x10);
  if (!cable) return { capacity: level(Math.min(units, 10)), charging: false };
  if (units <= 10) return { capacity: level(units), charging: true };
  if (units === 11) return { capacity: 100, charging: true };
  return null;
}

export async function readBattery(device) {
  const channel = channelOf(device);
  if (!channel) throw new Error("no command channel");
  const parse = DUALSENSE.has(device.productId) ? parseDualSense : parseDualShock4;
  const bluetooth = isBluetooth(channel);
  const handle = await session.acquire(channel.path);
  await session.readQueued(channel.path, handle);
  const deadline = Date.now() + LISTEN_MS;
  let askedForFullReport = false;
  while (Date.now() < deadline) {
    const frame = await session.read(channel.path, handle, 100);
    if (frame.length === 0) continue;
    const reading = parse(frame, bluetooth, device.productId === ADAPTER);
    if (reading?.off) throw new Error("device is off");
    if (reading) return reading;
    if (bluetooth && frame[0] === 0x01 && !askedForFullReport) {
      askedForFullReport = true;
      await handle.getFeatureReport(FULL_REPORT.id, FULL_REPORT.size);
    }
  }
  throw new Error("device is off");
}

export async function identify(device) {
  const channel = channelOf(device);
  const [id, size] = DUALSENSE.has(device.productId) ? [0x09, 20] : [0x12, 16];
  const handle = await session.acquire(channel.path);
  const report = Array.from(await handle.getFeatureReport(id, size));
  return address(report.slice(1, 7).reverse().map(
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join(""));
}

export const id = "playstation";
export const needsIdentify = true;
