// @ts-nocheck
import * as session from "../session";
import DEVICES from "./razer-devices";

const RAZER = 0x1532;
const REPORT_SIZE = 90;
const REPORT_ID = 0;
const CLASS_MISC = 0x07;
const CMD_BATTERY = 0x80;
const CMD_CHARGING = 0x84;
const STATUS_BUSY = 0x01;
const STATUS_OK = 0x02;
const STATUS_TIMEOUT = 0x04;
const NO_DEVICE = /is (off|not answering)$/;
const ANSWER_ATTEMPTS = 8;
const ANSWER_WAIT_MS = 40;
const working = new Map();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const entry = (productId) => DEVICES.find(([product]) => product === productId) ?? null;

export function matches(device) {
  return device.vendorId === RAZER && !!entry(device.productId);
}

export function buildRequest(transactionId, commandId) {
  const report = new Array(REPORT_SIZE).fill(0);
  report[1] = transactionId;
  report[5] = 0x02;
  report[6] = CLASS_MISC;
  report[7] = commandId;
  for (let index = 2; index < 88; index += 1) report[88] ^= report[index];
  return report;
}

export function parseReply(report, commandId) {
  if (report.length < REPORT_SIZE) return null;
  if (report[0] !== STATUS_OK || report[6] !== CLASS_MISC || report[7] !== commandId) return null;
  return report.slice(8, 88);
}

async function ask(path, device, transactionId, commandId) {
  await session.sendFeatureReport(
    path,
    device,
    [REPORT_ID, ...buildRequest(transactionId, commandId)],
  );
  for (let attempt = 0; attempt < ANSWER_ATTEMPTS; attempt += 1) {
    await sleep(ANSWER_WAIT_MS);
    const raw = await session.getFeatureReport(path, device, REPORT_ID, REPORT_SIZE + 1);
    const report = raw.slice(1);
    if (report[0] === STATUS_BUSY) continue;
    if (
      report[0] === STATUS_TIMEOUT &&
      report[6] === CLASS_MISC &&
      report[7] === commandId
    ) throw new Error("device is not answering");
    const args = parseReply(report, commandId);
    if (args) return args;
    throw new Error("device did not accept the request");
  }
  throw new Error("timeout waiting for battery response");
}

async function readFrom(channel, transactionId) {
  const device = await session.acquire(channel.path);
  const level = await ask(channel.path, device, transactionId, CMD_BATTERY);
  if (level[1] === 0) throw new Error("device is off");
  const charging = await ask(channel.path, device, transactionId, CMD_CHARGING)
    .then((answer) => !!answer[1], () => null);
  return { capacity: Math.round((level[1] * 100) / 255), charging };
}

export async function readBattery(device) {
  const found = entry(device.productId);
  if (!found) throw new Error("unsupported device");
  const known = device.channels.find((channel) => channel.path === working.get(device.id));
  const channels = known
    ? [known]
    : [...device.channels].sort((a, b) => a.interface - b.interface);
  let lastError = new Error("no command channel");
  for (const channel of channels) {
    try {
      const reading = await readFrom(channel, found[1]);
      working.set(device.id, channel.path);
      return reading;
    } catch (error) {
      lastError = error;
      if (NO_DEVICE.test(error.message)) break;
    }
  }
  working.delete(device.id);
  throw lastError;
}

export const id = "razer";
