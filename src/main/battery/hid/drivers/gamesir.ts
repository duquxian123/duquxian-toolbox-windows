// @ts-nocheck
import * as session from "../session";

const GAMESIR = 0x3537;
const NOVA_2_LITE = 0x1098;
const USAGE_PAGE = 0xff7a;
const USAGE = 1;
const RESPONSE_TIMEOUT_MS = 4000;
const READ_SLICE_MS = 100;

export const QUERY_REPORT = Buffer.alloc(65, 0);
QUERY_REPORT[1] = 0x01;
QUERY_REPORT[2] = 0x01;

export function matches(device) {
  return device.vendorId === GAMESIR &&
    device.productId === NOVA_2_LITE &&
    !!channelOf(device);
}

export function parseFrame(frame) {
  if (
    frame.length < 19 ||
    frame[0] !== 0x01 ||
    frame[16] !== 0x04 ||
    frame[17] !== 0x02
  ) {
    return null;
  }

  const raw = frame[18];
  if (raw === 0xff) {
    return { capacity: 100, charging: true, voltageMv: null };
  }
  if (raw < 0 || raw > 100) return null;
  return { capacity: raw, charging: false, voltageMv: null };
}

function channelOf(device) {
  return device.channels.find(
    (channel) => channel.usagePage === USAGE_PAGE && channel.usage === USAGE,
  );
}

export async function readBattery(device) {
  const channel = channelOf(device);
  if (!channel) throw new Error("GameSir vendor channel is not available");

  const handle = await session.acquire(channel.path);
  await session.readQueued(channel.path, handle);
  await session.write(channel.path, handle, QUERY_REPORT);

  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const reading = parseFrame(await session.read(channel.path, handle, READ_SLICE_MS));
    if (reading) return reading;
  }
  throw new Error("timeout waiting for GameSir Nova 2 Lite response");
}

export const id = "gamesir-connect";
