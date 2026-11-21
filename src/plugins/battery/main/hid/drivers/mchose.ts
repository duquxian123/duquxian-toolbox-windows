// @ts-nocheck
const VENDOR_ID = 0x3837;
const PRODUCT_ID = 0x600a;
const SKIP_LEVELS = new Set([1, 2, 4]);

export const id = "mchose";
export const eventDriven = true;

export function matches(device) {
  return device.vendorId === VENDOR_ID && device.productId === PRODUCT_ID;
}

export function parseFrame(frame) {
  if (frame[0] !== 0x55) return null;
  const level = frame[2];
  if (level === 0 || SKIP_LEVELS.has(level) || level > 100) return null;
  return { capacity: level, charging: null, voltageMv: null, raw: frame };
}
