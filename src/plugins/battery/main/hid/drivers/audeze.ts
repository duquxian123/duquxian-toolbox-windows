// @ts-nocheck
import { execFile } from "node:child_process";
import { pad } from "../exchange";
import { batteryResourcePath } from "../../paths";

const AUDEZE = 0x3329;
const PRODUCTS = new Set([0x4b19, 0x4b18, 0x4b29, 0x4b28]);
const REPORT_OUT = 0x06;
const REPORT_SIZE = 62;
const ROUTE_HEADSET = 0x80;
const FRAGMENT_OFFSET = 3;
const MARKER = 0x05;
const TYPE_RESPONSE = 0x5b;
const TYPE_RESULT = 0x5d;
const CMD = [0xd6, 0x0c];
const SCRIPT_TIMEOUT_MS = 6000;
const COMMAND = { usagePage: 0xff13, usage: 0x01 };
const preference = (channel) => (
  channel.usagePage === COMMAND.usagePage && channel.usage === COMMAND.usage ? 2 : Number(channel.usagePage >= 0xff00)
);

export function matches(device) {
  return device.vendorId === AUDEZE && PRODUCTS.has(device.productId);
}

export function buildRequest() {
  const body = [...CMD, 0x00];
  const message = [MARKER, 0x5a, body.length, 0x00, ...body];
  return pad([REPORT_OUT, message.length, ROUTE_HEADSET, ...message], REPORT_SIZE);
}

export function parseReports(reports) {
  const stream = [];
  for (const report of reports) {
    const length = report[1];
    if (length > 0) stream.push(...report.slice(FRAGMENT_OFFSET, FRAGMENT_OFFSET + length));
  }
  for (let index = 0; index + 4 <= stream.length;) {
    if (stream[index] !== MARKER) {
      index += 1;
      continue;
    }
    const type = stream[index + 1];
    const size = stream[index + 2] | (stream[index + 3] << 8);
    const body = stream.slice(index + 4, index + 4 + size);
    if (body[0] === CMD[0] && body[1] === CMD[1]) {
      if (type === TYPE_RESULT && body.length >= 5) {
        return { capacity: Math.min(body[4], 100), charging: null };
      }
      if (type === TYPE_RESPONSE && body[2] !== 0x00) return { off: true };
    }
    index += 4 + size;
  }
  return null;
}

export function candidates(device) {
  return [...device.channels].sort((a, b) => preference(b) - preference(a));
}

function exchange(channelPath) {
  const hex = buildRequest().map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        batteryResourcePath("input-report.ps1"),
        channelPath,
        hex,
        String(REPORT_SIZE),
        "7",
      ],
      { windowsHide: true, timeout: SCRIPT_TIMEOUT_MS },
      (error, stdout) => {
        if (error) return reject(new Error("could not read device"));
        resolve(
          stdout.split(/\r?\n/)
            .filter(Boolean)
            .map((line) => Array.from(Buffer.from(line.trim(), "hex"))),
        );
      },
    );
  });
}

export async function readBattery(device) {
  let lastError = new Error("no command channel");
  for (const channel of candidates(device)) {
    let reports;
    try {
      reports = await exchange(channel.path);
    } catch (error) {
      lastError = error;
      continue;
    }
    const reading = parseReports(reports);
    if (reading && !reading.off) return reading;
    throw new Error("headset is off");
  }
  throw lastError;
}

export const id = "audeze";
