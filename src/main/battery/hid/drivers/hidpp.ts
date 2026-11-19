// @ts-nocheck
import { exchange, pad, fromVoltage } from "../exchange";

const LOGITECH = 0x046d;
const LONG = 0x11;
const LONG_LENGTH = 20;
const SOFTWARE_ID = 0x0b;
const ROOT_INDEX = 0;
const ERROR_INDEX = 0xff;
const OLD_ERROR_INDEX = 0x8f;
const UNREACHABLE = new Set([0x04, 0x08, 0x09]);
const DIRECT = 0xff;
const RECEIVER_SLOTS = [1, 2, 3, 4, 5, 6];
const REPLY_MS = 400;
const UNIFIED_BATTERY = 0x1004;
const BATTERY_STATUS = 0x1000;
const BATTERY_VOLTAGE = 0x1001;
const UNIFIED_LEVELS = [[8, 100], [4, 50], [2, 20], [1, 5]];
const CELL_CURVE = [[4190, 100], [4060, 90], [3980, 80], [3920, 70], [3870, 60], [3830, 50], [3790, 40], [3760, 30], [3730, 20], [3690, 10], [3500, 0]];
const routes = new Map();

function channelOf(device) {
  const on = (page, usage) => device.channels.find(
    (channel) => channel.usagePage === page && channel.usage === usage,
  );
  return on(0xff00, 0x02) ?? on(0xff43, 0x0202);
}

export function matches(device) {
  return device.vendorId === LOGITECH && !!channelOf(device);
}

export function request(device, index, fn, params = []) {
  return pad([LONG, device, index, (fn << 4) | SOFTWARE_ID, ...params], LONG_LENGTH);
}

export function replyTo(frame, device, index, fn) {
  if (frame.length < 6 || frame[1] !== device) return null;
  if (frame[2] === ERROR_INDEX || frame[2] === OLD_ERROR_INDEX) {
    if (frame[3] !== index || frame[4] !== ((fn << 4) | SOFTWARE_ID)) return null;
    if (frame[2] === OLD_ERROR_INDEX && UNREACHABLE.has(frame[5])) throw new Error("device is off");
    throw new Error(`device refused the request (error ${frame[5]})`);
  }
  if (frame[2] !== index || frame[3] !== ((fn << 4) | SOFTWARE_ID)) return null;
  return frame.slice(4);
}

const SILENT = /^timeout waiting/;
const ANSWERED = /^device (is off|refused)/;
const isOutcome = (error) => SILENT.test(error.message) || ANSWERED.test(error.message);
const weight = (error) => /^device refused/.test(error.message)
  ? 3
  : /is off$/.test(error.message)
    ? 2
    : 1;

const call = (channel, device, index, fn, params) => exchange(
  channel,
  request(device, index, fn, params),
  (frame) => replyTo(frame, device, index, fn),
  REPLY_MS,
);

async function featureIndex(channel, device, feature) {
  const params = await call(channel, device, ROOT_INDEX, 0, [feature >> 8, feature & 0xff]);
  return params[0];
}

export function parseUnified(params) {
  let capacity = params[0];
  if (capacity === 0) {
    const level = UNIFIED_LEVELS.find(([bit]) => params[1] & bit);
    capacity = level?.[1] ?? 0;
  }
  const full = params[2] === 3;
  return {
    capacity: full ? 100 : capacity,
    charging: params[2] === 1 || params[2] === 2 || full,
  };
}

export function parseStatus(params) {
  const full = params[2] === 3;
  return {
    capacity: full ? 100 : params[0],
    charging: params[2] === 1 || params[2] === 2 || params[2] === 4 || full,
  };
}

export function parseVoltage(params) {
  const voltageMv = (params[0] << 8) | params[1];
  const charging = !!(params[2] & 0x80) && (params[2] & 0x07) < 2;
  return {
    capacity: charging && (params[2] & 0x07) === 1
      ? 100
      : fromVoltage(voltageMv, CELL_CURVE),
    charging,
    voltageMv,
  };
}

const FEATURES = [
  { feature: UNIFIED_BATTERY, fn: 1, parse: parseUnified },
  { feature: BATTERY_STATUS, fn: 0, parse: parseStatus },
  { feature: BATTERY_VOLTAGE, fn: 0, parse: parseVoltage },
];

async function findRoute(channel, device) {
  const receiver = /receiver/i.test(device.product);
  const slots = receiver ? RECEIVER_SLOTS : [DIRECT, ...RECEIVER_SLOTS];
  let failure = null;
  for (const slot of slots) {
    for (const entry of FEATURES) {
      try {
        const index = await featureIndex(channel, slot, entry.feature);
        if (index) return { device: slot, index, entry };
      } catch (error) {
        if (!isOutcome(error)) throw error;
        if (!failure || weight(error) > weight(failure)) failure = error;
        break;
      }
    }
  }
  if (!failure) throw new Error("no battery feature found");
  if (weight(failure) === 1) throw new Error("device is not answering");
  throw failure;
}

async function readRoute(channel, route) {
  const params = await call(channel, route.device, route.index, route.entry.fn);
  const reading = route.entry.parse(params);
  if (!reading.capacity) throw new Error("waiting for device to report");
  return reading;
}

export async function readBattery(device) {
  const channel = channelOf(device);
  if (!channel) throw new Error("no command channel");
  const known = routes.get(channel.path);
  if (known) {
    try {
      return await readRoute(channel, known);
    } catch (error) {
      routes.delete(channel.path);
      if (!isOutcome(error)) throw error;
    }
  }
  const route = await findRoute(channel, device);
  routes.set(channel.path, route);
  try {
    return await readRoute(channel, route);
  } catch (error) {
    routes.delete(channel.path);
    throw error;
  }
}

export const id = "hidpp";
