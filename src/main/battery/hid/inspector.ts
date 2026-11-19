// @ts-nocheck
import * as session from "./session";

const CAPTURE_MS = 30000;
const FEATURE_POLL_MS = 800;
const PING_MS = 1000;
const READ_SLICE_MS = 100;
const FEATURE_IDS_TO_TRY = [1, 2, 3, 4, 5, 6, 7, 8];
const FEATURE_LENGTHS_TO_TRY = [8, 16, 32];
const VENDOR_USAGE_PAGE_MIN = 0xff00;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function capture(device) {
  const frames = new Map();
  const deadline = Date.now() + CAPTURE_MS;
  const record = (channel, reportKind, reportId, bytes) => {
    const array = Array.from(bytes);
    const hex = array.map((byte) => byte.toString(16).padStart(2, "0")).join(" ");
    const key = `${channel.usagePage}:${channel.usage}:${reportKind}:${reportId}:${hex}`;
    const existing = frames.get(key);
    if (existing) {
      existing.count += 1;
      existing.lastSeen = Date.now();
    } else {
      frames.set(key, {
        usagePage: channel.usagePage,
        usage: channel.usage,
        reportKind,
        reportId,
        bytes: array,
        hex,
        count: 1,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
      });
    }
  };

  const readFeature = async (channel, handle, id, length) => {
    try {
      record(channel, "feature", id, await handle.getFeatureReport(id, length));
      return true;
    } catch {
      return false;
    }
  };

  const watchChannel = async (channel) => {
    let handle;
    try {
      handle = await session.acquire(channel.path);
    } catch {
      return;
    }
    const isVendor = channel.usagePage >= VENDOR_USAGE_PAGE_MIN;
    let listening = isVendor;
    const supported = [];
    for (const id of FEATURE_IDS_TO_TRY) {
      for (const length of FEATURE_LENGTHS_TO_TRY) {
        if (await readFeature(channel, handle, id, length)) supported.push([id, length]);
      }
    }
    let nextFeaturePoll = Date.now() + FEATURE_POLL_MS;
    let nextPing = 0;
    while (Date.now() < deadline) {
      if (isVendor && Date.now() >= nextPing) {
        await handle.write(Buffer.alloc(17, 0)).catch(() => {});
        nextPing = Date.now() + PING_MS;
      }
      if (Date.now() >= nextFeaturePoll) {
        for (const [id, length] of supported) {
          await readFeature(channel, handle, id, length);
        }
        nextFeaturePoll = Date.now() + FEATURE_POLL_MS;
      }
      if (!listening) {
        await sleep(READ_SLICE_MS);
        continue;
      }
      try {
        const frame = Array.from(await handle.read(READ_SLICE_MS));
        if (frame.length > 0) record(channel, "input", frame[0], frame);
      } catch {
        listening = false;
      }
    }
  };

  await Promise.all(device.channels.map(watchChannel));
  return Array.from(frames.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}
