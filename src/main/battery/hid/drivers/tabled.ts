// @ts-nocheck
import { exchange } from "../exchange";
import * as table from "./table";

function channelsFor(device, entry) {
  const rule = entry.channel;
  if (!rule) return device.channels.filter((channel) => channel.usagePage >= 0xff00);
  return device.channels.filter(
    (channel) =>
      (rule.usagePage === undefined || channel.usagePage === rule.usagePage) &&
      (rule.usage === undefined || channel.usage === rule.usage) &&
      (rule.interface === undefined || channel.interface === rule.interface),
  );
}

export function matches(device) {
  const entry = table.find(device);
  return !!entry && channelsFor(device, entry).length > 0;
}

async function runSteps(channel, entry, productId) {
  const reading = { charging: null };
  for (const step of entry.steps) {
    const part = await exchange(channel, step.request, (frame) => step.parse(frame, productId));
    if (part.offline) throw new Error(`${entry.kind} is off`);
    Object.assign(reading, part);
  }
  if (typeof reading.capacity !== "number") throw new Error("waiting for device to report");
  return reading;
}

export async function readBattery(device) {
  const entry = table.find(device);
  if (!entry) throw new Error("unsupported device");
  let lastError = new Error("no command channel");
  let silent = false;
  for (const channel of channelsFor(device, entry)) {
    try {
      return await runSteps(channel, entry, device.productId);
    } catch (error) {
      lastError = error;
      if (/^timeout/.test(error.message)) silent = true;
      if (/ is off$/.test(error.message)) break;
    }
  }
  if (silent && !entry.wired && !/ is off$/.test(lastError.message)) {
    throw new Error(`${entry.kind} is not answering`);
  }
  throw lastError;
}

export const id = "tabled";
export { channelsFor };
