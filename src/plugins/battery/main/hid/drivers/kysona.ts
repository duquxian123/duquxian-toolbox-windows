// @ts-nocheck
import { findChannel } from "../catalog";
import * as session from "../session";
import * as compx from "./compx";

const USAGE_PAGE_COMMAND = 0xff02;
const BATTERY_REQUEST = [0x08, 0x04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x49];
const STATUS_REQUEST = [0x08, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x4a];
const FRAME_LENGTH = 17;
const OFF_ANSWERS = 2;
const RESPONSE_TIMEOUT_MS = 4000;
const REPOKE_MS = 500;
const READ_SLICE_MS = 100;
const KNOWN_VENDOR_IDS = new Set([0x3554]);

export function matches(device) {
  if (!KNOWN_VENDOR_IDS.has(device.vendorId) || compx.matches(device)) return false;
  return !!findChannel(device, USAGE_PAGE_COMMAND);
}

export function parseFrame(frame) {
  if (frame[0] !== 0x08 || frame[1] !== 0x04) return null;
  const capacity = frame[6];
  if (!(capacity > 0 && capacity <= 100)) return null;
  return {
    capacity,
    charging: !!frame[7],
    voltageMv: (frame[8] << 8) | frame[9],
  };
}

export function parseStatus(frame) {
  if (frame.length < FRAME_LENGTH || frame[0] !== 0x08 || frame[1] !== 0x03 || frame[6] > 1) {
    return null;
  }
  let sum = 0;
  for (let index = 0; index < FRAME_LENGTH - 1; index += 1) sum += frame[index];
  if (((0x55 - sum) & 0xff) !== frame[FRAME_LENGTH - 1]) return null;
  return frame[6] === 1;
}

function commandChannels(device) {
  const main = findChannel(device, USAGE_PAGE_COMMAND);
  const others = device.channels.filter(
    (channel) => channel !== main && channel.usagePage >= 0xff00,
  );
  return main ? [main, ...others] : [];
}

export async function readBattery(device) {
  if (compx.matches(device)) return compx.readBattery(device);
  const channels = commandChannels(device);
  if (!channels.length) throw new Error("no command channel");
  let lastError = null;
  for (const channel of channels) {
    try {
      return await readFrom(channel);
    } catch (error) {
      if (!/cannot write/i.test(error.message)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function readFrom(channel) {
  const handle = await session.acquire(channel.path);
  await session.readQueued(channel.path, handle);
  const deadline = Date.now() + RESPONSE_TIMEOUT_MS;
  let nextPoke = 0;
  let pokes = 0;
  let connected = null;
  let offInARow = 0;
  while (Date.now() < deadline) {
    if (Date.now() >= nextPoke) {
      await session.write(channel.path, handle, STATUS_REQUEST);
      if (connected || (connected === null && pokes > 0)) {
        await session.write(channel.path, handle, BATTERY_REQUEST);
      }
      pokes += 1;
      nextPoke = Date.now() + REPOKE_MS;
    }
    const frame = await session.read(channel.path, handle, READ_SLICE_MS);
    const reading = parseFrame(frame);
    if (reading) return reading;
    const status = parseStatus(frame);
    if (status === true) {
      if (!connected) nextPoke = 0;
      connected = true;
      offInARow = 0;
    } else if (status === false) {
      connected = false;
      offInARow += 1;
      if (offInARow >= OFF_ANSWERS) throw new Error("mouse is off");
    }
  }
  throw new Error("timeout waiting for battery response");
}

export const id = "kysona";
export const hasWiredIdentity = true;
