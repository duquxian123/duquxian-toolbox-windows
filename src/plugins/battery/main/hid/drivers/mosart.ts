// @ts-nocheck
import { findChannel } from "../catalog";
import * as session from "../session";

const VENDOR_ID = 0x1a81;
const PRODUCT_ID = 0x1202;
const USAGE_PAGE = 0xff02;
const USAGE = 2;
const REPORT_ID = 6;
const REPORT_LENGTH = 9;
const CAPACITY_BYTE = 7;
const CAPACITY_MASK = 0x7f;

const channelOf = (device) => findChannel(device, USAGE_PAGE, USAGE);

export function matches(device) {
  return device.vendorId === VENDOR_ID &&
    device.productId === PRODUCT_ID &&
    !!channelOf(device);
}

export function parseFrame(frame) {
  if (frame.length < REPORT_LENGTH) return null;
  const encoded = frame[CAPACITY_BYTE];
  if (typeof encoded !== "number") return null;
  const capacity = encoded & CAPACITY_MASK;
  if (capacity < 1 || capacity > 100) return null;
  return {
    capacity,
    charging: null,
    voltageMv: null,
    raw: frame.slice(),
  };
}

export async function readBattery(device) {
  const channel = channelOf(device);
  if (!channel) throw new Error("no MOSART battery channel");
  const handle = await session.acquire(channel.path);
  const report = await session.getFeatureReport(
    channel.path,
    handle,
    REPORT_ID,
    REPORT_LENGTH,
  );
  const reading = parseFrame(report);
  if (!reading) throw new Error("waiting for MOSART battery report");
  return reading;
}

export const id = "mosart";
