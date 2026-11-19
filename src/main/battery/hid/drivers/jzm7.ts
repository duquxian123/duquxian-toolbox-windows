// @ts-nocheck
import { findChannel } from "../catalog";
import * as session from "../session";

const VENDOR_ID = 0x369b;
const PRODUCT_ID = 0x04f4;
const USAGE_PAGE = 0xffa0;
const USAGE = 2;
const INPUT_REPORT_ID = 0xa1;
export const QUERY_REPORT = Buffer.alloc(64);
QUERY_REPORT[0] = 0xa0;
QUERY_REPORT[1] = 0x50;

const channelOf = (device) => findChannel(device, USAGE_PAGE, USAGE);

export function matches(device) {
  return device.vendorId === VENDOR_ID &&
    device.productId === PRODUCT_ID &&
    !!channelOf(device);
}

export function parseFrame(frame) {
  if (frame.length < 9 || frame[0] !== INPUT_REPORT_ID || frame[1] !== 0x50) return null;
  const capacity = frame[8];
  if (!(capacity > 0 && capacity <= 100)) return null;
  return { capacity, charging: null, voltageMv: null, raw: frame.slice(0, 20) };
}

export async function readBattery(device) {
  const channel = channelOf(device);
  if (!channel) throw new Error("no JZ M7 vendor channel");
  const handle = await session.acquire(channel.path);
  await session.readQueued(channel.path, handle);
  await session.write(channel.path, handle, QUERY_REPORT);
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const reading = parseFrame(await session.read(channel.path, handle, 100));
    if (reading) return reading;
  }
  throw new Error("timeout waiting for JZ M7 battery response");
}

export const id = "jzm7";
