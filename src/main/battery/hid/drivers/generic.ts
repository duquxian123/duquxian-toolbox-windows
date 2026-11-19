// @ts-nocheck
import { findChannel } from "../catalog";
import { frameToReading, toPercent } from "../scale";
import * as session from "../session";

const INPUT_TIMEOUT_MS = 8000;
const READ_SLICE_MS = 100;

function matching(frame, profile) {
  return frame[0] === profile.reportId ? frameToReading(frame, profile) : null;
}

async function readInput(path, device, profile) {
  let latest = null;
  for (const frame of await session.readQueued(path, device)) {
    latest = matching(frame, profile) ?? latest;
  }
  if (latest) return latest;
  if (profile.trigger) await session.write(path, device, profile.trigger).catch(() => {});
  const deadline = Date.now() + INPUT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const reading = matching(await session.read(path, device, READ_SLICE_MS), profile);
    if (reading) return reading;
  }
  throw new Error("timeout waiting for device response");
}

export async function readBattery(device, profile) {
  const channel = findChannel(device, profile.usagePage, profile.usage);
  if (!channel) throw new Error("calibrated channel not present on this device");
  const handle = await session.acquire(channel.path);
  if (profile.reportKind !== "feature") return readInput(channel.path, handle, profile);
  const report = await session.getFeatureReport(
    channel.path,
    handle,
    profile.reportId,
    profile.readLength,
  );
  const reading = frameToReading(report, profile);
  if (!reading) throw new Error("waiting for device to report");
  return reading;
}

export const id = "generic";
export { toPercent };
