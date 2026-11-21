import * as HID from "node-hid";

const MAX_QUEUED_FRAMES = 64;
const sessions = new Map<string, Promise<HID.HIDAsync>>();

export function acquire(path: string): Promise<HID.HIDAsync> {
  let opening = sessions.get(path);
  if (!opening) {
    opening = HID.HIDAsync.open(path);
    sessions.set(path, opening);
    opening.catch(() => {
      if (sessions.get(path) === opening) sessions.delete(path);
    });
  }
  return opening;
}

export async function read(path: string, device: HID.HIDAsync, timeoutMs: number): Promise<number[]> {
  try {
    const result = await device.read(timeoutMs);
    return result ? Array.from(result) : [];
  } catch (error) {
    sessions.delete(path);
    void device.close().catch(() => {});
    throw error;
  }
}

export async function readQueued(path: string, device: HID.HIDAsync): Promise<number[][]> {
  const frames: number[][] = [];
  while (frames.length < MAX_QUEUED_FRAMES) {
    const frame = await read(path, device, 0);
    if (frame.length === 0) break;
    frames.push(frame);
  }
  return frames;
}

export async function write(path: string, device: HID.HIDAsync, bytes: number[] | Buffer): Promise<void> {
  try {
    await device.write(bytes);
  } catch (error) {
    sessions.delete(path);
    void device.close().catch(() => {});
    throw error;
  }
}

export async function getFeatureReport(
  path: string,
  device: HID.HIDAsync,
  reportId: number,
  length: number,
): Promise<number[]> {
  try {
    return Array.from(await device.getFeatureReport(reportId, length));
  } catch (error) {
    sessions.delete(path);
    void device.close().catch(() => {});
    throw error;
  }
}

export async function sendFeatureReport(
  path: string,
  device: HID.HIDAsync,
  bytes: number[],
): Promise<void> {
  try {
    await device.sendFeatureReport(bytes);
  } catch (error) {
    sessions.delete(path);
    void device.close().catch(() => {});
    throw error;
  }
}
