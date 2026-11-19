// @ts-nocheck
import * as session from "./session";

const READ_SLICE_MS = 100;

export function pad(bytes: number[], length: number): number[] {
  return bytes.concat(new Array(Math.max(0, length - bytes.length)).fill(0));
}

export async function exchange(
  channel,
  request,
  accept,
  timeoutMs = 1500,
) {
  const device = await session.acquire(channel.path);
  await session.readQueued(channel.path, device);
  await session.write(channel.path, device, request);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = await session.read(channel.path, device, READ_SLICE_MS);
    if (frame.length === 0) continue;
    const result = accept(frame);
    if (result !== null && result !== undefined) return result;
  }
  throw new Error("timeout waiting for battery response");
}

export function scale(value, min, max) {
  return Math.round(Math.min(100, Math.max(0, ((value - min) * 100) / (max - min))));
}

export function fromVoltage(mv, points) {
  if (mv >= points[0][0]) return points[0][1];
  for (let index = 1; index < points.length; index += 1) {
    const [voltage, percent] = points[index];
    if (mv >= voltage) {
      const [highVoltage, highPercent] = points[index - 1];
      return Math.round(percent + ((mv - voltage) * (highPercent - percent)) / (highVoltage - voltage));
    }
  }
  return 0;
}
