// @ts-nocheck
import { execFile } from "node:child_process";
import * as session from "../session";
import { batteryResourcePath } from "../../paths";

const VENDOR = 0x3554;
const PRODUCT = 0xfa09;
const USAGE_PAGE = 0xff02;
const LENGTH = 20;
const PLAIN_MS = 1500;
const CONTROL_MS = 2000;
const REPOKE_MS = 500;
const READ_SLICE_MS = 100;
const SCRIPT_TIMEOUT_MS = 6000;

export function frame(command, argument) {
  const report = new Array(LENGTH).fill(0);
  report[0] = 0x13;
  report[1] = command;
  report[2] = argument;
  report[LENGTH - 1] = report.reduce((sum, byte) => sum + byte, 0) & 0xff;
  return report;
}

const SESSION = frame(0x05, 0x01);
const REQUESTS = [SESSION, frame(0x4a, 0x01), frame(0x4a, 0x00)];
const channelOf = (device) => device.channels.find(
  (channel) => channel.usagePage === USAGE_PAGE &&
    (channel.usage === undefined || channel.usage === 2),
);

export function matches(device) {
  return device.vendorId === VENDOR && device.productId === PRODUCT && !!channelOf(device);
}

export function parseFrame(report) {
  if (report.length < LENGTH || report[0] !== 0x13) return null;
  let sum = 0;
  for (let index = 0; index < LENGTH - 1; index += 1) sum += report[index];
  if ((sum & 0xff) !== report[LENGTH - 1]) return null;
  let level = null;
  let flags = 0;
  if ((report[1] & 0x7f) === 0x4a && report[2] === 0x01 && report[3] === 0 && report[4] === 2) {
    [level, flags] = [report[5], report[6]];
  } else if (report[1] === 0x0a && report[2] === 0x01 && report[4] === 4 && report[5] === 5) {
    [level, flags] = [report[6], report[7]];
  } else if (report[1] === 0x05 && report[2] === 0x01 && report[4] === 0x0a) {
    return { ack: true };
  }
  if (level === null || level < 1 || level > 100) return null;
  return { capacity: level, charging: !!(flags & 0x10) };
}

function sendControl(channelPath) {
  const reports = REQUESTS.map(
    (request) => request.map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        batteryResourcePath("output-report.ps1"),
        channelPath,
        reports.join(","),
      ],
      { windowsHide: true, timeout: SCRIPT_TIMEOUT_MS },
      (error) => error ? reject(new Error("could not send to device")) : resolve(),
    );
  });
}

export async function readBattery(device) {
  const channel = channelOf(device);
  if (!channel) throw new Error("no command channel");
  const handle = await session.acquire(channel.path);
  await session.readQueued(channel.path, handle);
  let answered = false;
  let writeError = null;
  const listen = async (more, poke) => {
    let nextPoke = 0;
    while (more()) {
      if (poke && Date.now() >= nextPoke) {
        for (const request of REQUESTS) {
          try {
            await session.write(channel.path, handle, request);
          } catch (error) {
            writeError = error;
          }
        }
        nextPoke = Date.now() + REPOKE_MS;
      }
      const parsed = parseFrame(await session.read(channel.path, handle, READ_SLICE_MS));
      if (parsed?.ack) answered = true;
      else if (parsed) return parsed;
    }
    return null;
  };

  const plainUntil = Date.now() + PLAIN_MS;
  const plain = await listen(() => Date.now() < plainUntil, true);
  if (plain) return plain;
  let controlError = null;
  let sentAt = null;
  const giveUpAt = Date.now() + SCRIPT_TIMEOUT_MS + CONTROL_MS;
  const sent = sendControl(channel.path)
    .catch((error) => { controlError = error; })
    .then(() => { sentAt = Date.now(); });
  const control = await listen(
    () => Date.now() < giveUpAt && (sentAt === null || Date.now() < sentAt + CONTROL_MS),
    false,
  );
  await sent;
  if (control) return control;
  if (answered) throw new Error("keyboard is not answering");
  throw writeError ?? controlError ?? new Error("timeout waiting for battery response");
}

export const id = "compx";
