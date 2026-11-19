// @ts-nocheck
import { pad, scale, fromVoltage } from "../exchange";

const OFFLINE = { offline: true };
const STATUS_REQUEST = [0x00, 0xb0];
const clampPercent = (value) => Math.min(100, Math.max(0, value));

const STEELSERIES = 0x1038;
const NOVA_CHANNEL = { usagePage: 0xffc0, usage: 0x01, interface: 3 };
const NOVA_DISCRETE_LEVELS = new Set([0x2202, 0x2206, 0x220a, 0x223a, 0x227a, 0x22a4]);
const LOGITECH = 0x046d;
const LOGITECH_CHANNEL = { usagePage: 0xff43, usage: 0x0202 };
const HP = 0x03f0;
const KINGSTON = 0x0951;
const curve = (mv, percent) => mv.map((value, index) => [value, percent[index]]);
const G533_CURVE = curve([4200, 3850, 3790, 3750, 3680, 3330], [100, 50, 30, 20, 5, 0]);
const G535_CURVE = curve([4175, 3817, 3766, 3730, 3664, 3310], [100, 50, 30, 20, 5, 0]);
const G633_CURVE = curve([4100, 3950, 3850, 3750, 3650, 3500, 3450, 3300], [100, 80, 60, 40, 20, 10, 5, 0]);
const GPRO_CURVE = curve([4150, 3830, 3780, 3740, 3670, 3320], [100, 50, 30, 20, 5, 0]);
const CLOUD_FLIGHT_CURVE = curve([3975, 3900, 3800, 3700, 3648, 0], [100, 80, 50, 25, 8, 0]);

function novaWireless(frame) {
  if (frame.length < 5) return null;
  if (frame[1] === 0x02) return OFFLINE;
  return { capacity: clampPercent(frame[3]), charging: frame[4] === 0x01 };
}

function nova7(frame, productId) {
  if (frame.length < 4) return null;
  if (frame[3] === 0x00) return OFFLINE;
  const capacity = NOVA_DISCRETE_LEVELS.has(productId)
    ? scale(frame[2], 0, 4)
    : clampPercent(frame[2]);
  return { capacity, charging: frame[3] === 0x01 || frame[3] === 0x02 };
}

function hidppVoltageStep(command, points) {
  return {
    request: pad([0x11, 0xff, ...command], 20),
    parse(frame) {
      if (frame.length < 7 || frame[0] !== 0x11) return null;
      if (frame[2] === 0xff) {
        return frame[3] === command[0] && frame[4] === command[1] ? OFFLINE : null;
      }
      if (frame[2] !== command[0] || frame[3] !== command[1]) return null;
      const voltageMv = (frame[4] << 8) | frame[5];
      if (voltageMv < points[points.length - 1][0]) return OFFLINE;
      return {
        capacity: fromVoltage(voltageMv, points),
        charging: frame[6] === 0x03,
        voltageMv,
      };
    },
  };
}

function cloud2Step(command, parse) {
  return {
    request: pad([0x06, 0xff, 0xbb, command, 0x00], 52),
    parse(frame) {
      if (
        frame.length < 8 ||
        frame[0] !== 0x06 ||
        frame[1] !== 0xff ||
        frame[2] !== 0xbb ||
        frame[3] !== command
      ) return null;
      return parse(frame);
    },
  };
}

function alphaStep(command, parse) {
  return {
    request: pad([0x21, 0xbb, command], 31),
    parse(frame) {
      if (frame.length < 4 || frame[0] !== 0x21 || frame[1] !== 0xbb || frame[2] !== command) {
        return null;
      }
      return parse(frame);
    },
  };
}

function aeroxBattery(frame) {
  if (frame.length < 2) return null;
  const level = ((frame[1] & 0x7f) - 1) * 5;
  if (level < 0 || level > 100) return OFFLINE;
  return { capacity: level, charging: !!(frame[1] & 0x80) };
}

export const DEVICES = [
  {
    name: "SteelSeries Arctis 1",
    kind: "headset",
    vendorId: STEELSERIES,
    productIds: [0x12b3, 0x12b6, 0x12d5, 0x12d7],
    channel: { usagePage: 0xff43, usage: 0x0202, interface: 3 },
    steps: [{ request: [0x06, 0x12], parse: (frame) => frame.length < 4 ? null : frame[2] === 0x01 ? OFFLINE : { capacity: clampPercent(frame[3]) } }],
  },
  {
    name: "SteelSeries Arctis 7",
    kind: "headset",
    vendorId: STEELSERIES,
    productIds: [0x1252, 0x1260, 0x1280, 0x12ad],
    channel: { usagePage: 0xff43, usage: 0x0202, interface: 5 },
    steps: [{ request: [0x06, 0x18], parse: (frame) => frame.length < 3 ? null : { capacity: clampPercent(frame[2]) } }],
  },
  {
    name: "SteelSeries Arctis 7+",
    kind: "headset",
    vendorId: STEELSERIES,
    productIds: [0x220e, 0x2212, 0x2216, 0x2236],
    channel: NOVA_CHANNEL,
    steps: [{ request: STATUS_REQUEST, parse: (frame) => frame.length < 4 ? null : frame[1] === 0x01 ? OFFLINE : { capacity: scale(frame[2], 0, 4), charging: frame[3] === 0x01 } }],
  },
  {
    name: "SteelSeries Arctis 9",
    kind: "headset",
    vendorId: STEELSERIES,
    productIds: [0x12c2, 0x12c4],
    channel: { interface: 0 },
    steps: [{ request: [0x00, 0x20], parse: (frame) => frame.length < 5 ? null : frame[4] === 0xff ? OFFLINE : { capacity: scale(frame[3], 0x64, 0x9a), charging: frame[4] === 0x01 } }],
  },
  {
    name: "SteelSeries Arctis Nova 3P/5",
    kind: "headset",
    vendorId: STEELSERIES,
    productIds: [0x2269, 0x226d, 0x2232, 0x2253],
    channel: NOVA_CHANNEL,
    steps: [{ request: STATUS_REQUEST, parse: novaWireless }],
  },
  {
    name: "SteelSeries Arctis Nova 7",
    kind: "headset",
    vendorId: STEELSERIES,
    productIds: [0x2202, 0x2206, 0x223a, 0x2258, 0x227a, 0x227e, 0x229e, 0x22a1, 0x22a4, 0x22a5, 0x22a9, 0x22ad, 0x220a, 0x22a7, 0x2298],
    channel: NOVA_CHANNEL,
    steps: [{ request: STATUS_REQUEST, parse: nova7 }],
  },
  {
    name: "SteelSeries Arctis Nova Pro Wireless",
    kind: "headset",
    vendorId: STEELSERIES,
    productIds: [0x12e0, 0x12e5],
    channel: { interface: 4 },
    steps: [{ request: pad([0x06, 0xb0], 31), parse: (frame) => frame.length < 16 ? null : frame[15] === 0x01 ? OFFLINE : { capacity: scale(frame[6], 0, 8), charging: frame[15] === 0x02 } }],
  },
  {
    name: "HyperX Cloud Alpha Wireless",
    kind: "headset",
    vendorId: HP,
    productIds: [0x098d],
    steps: [
      alphaStep(0x03, (frame) => frame[3] === 0x01 ? OFFLINE : {}),
      alphaStep(0x0c, (frame) => ({ charging: frame[3] === 0x01 })),
      alphaStep(0x0b, (frame) => ({ capacity: clampPercent(frame[3]) })),
    ],
  },
  {
    name: "HyperX Cloud Flight",
    kind: "headset",
    vendorId: KINGSTON,
    productIds: [0x16c4, 0x1723],
    steps: [{
      request: pad([0x21, 0xff, 0x05], 20),
      parse(frame) {
        if (frame.length !== 15 && frame.length !== 20) return null;
        const voltageMv = (frame[3] << 8) | frame[4];
        return {
          capacity: fromVoltage(voltageMv, CLOUD_FLIGHT_CURVE),
          charging: voltageMv > 0x100b,
          voltageMv,
        };
      },
    }],
  },
  {
    name: "HyperX Cloud II Wireless",
    kind: "headset",
    vendorId: HP,
    productIds: [0x0696, 0x018b],
    channel: { usagePage: 0xff90, usage: 0x0303, interface: 0 },
    steps: [
      cloud2Step(0x02, (frame) => ({ capacity: clampPercent(frame[7]) })),
      cloud2Step(0x03, (frame) => ({ charging: frame[4] === 1 })),
    ],
  },
  {
    name: "Corsair Void and Virtuoso",
    kind: "headset",
    vendorId: 0x1b1c,
    productIds: [0x1b1c, 0x1b27, 0x0a14, 0x0a16, 0x0a17, 0x0a1d, 0x0a1a, 0x1b2a, 0x1b23, 0x1b29, 0x0a55, 0x0a51, 0x0a52, 0x0a38, 0x0a4f, 0x0a2b, 0x0a75, 0x0a56],
    channel: { usagePage: 0xffc5, usage: 0x01, interface: 3 },
    steps: [{
      request: [0xc9, 0x64],
      parse(frame) {
        if (frame.length < 5 || frame[0] !== 100) return null;
        if (frame[4] === 0) return OFFLINE;
        return {
          capacity: clampPercent(frame[2] & 0x7f),
          charging: frame[4] === 4 || frame[4] === 5,
        };
      },
    }],
  },
  {
    name: "MCHOSE X9",
    kind: "headset",
    vendorId: 0x3837,
    productIds: [0x6045],
    channel: { usagePage: 0xff90, usage: 0x01 },
    steps: [{ request: pad([0x55, 0x65, 0x01], 64), parse: (frame) => frame.length >= 4 && frame[0] === 0x55 && frame[1] === 0x65 && frame[3] === 0x02 ? { capacity: clampPercent(frame[2]) } : null }],
  },
  {
    name: "Logitech G633, G733, G933",
    kind: "headset",
    vendorId: LOGITECH,
    productIds: [0x0a5c, 0x0a89, 0x0a5b, 0x0a87, 0x0ab5, 0x0afe, 0x0b1f],
    channel: LOGITECH_CHANNEL,
    steps: [hidppVoltageStep([0x08, 0x0a], G633_CURVE)],
  },
  {
    name: "Logitech G533",
    kind: "headset",
    vendorId: LOGITECH,
    productIds: [0x0a66],
    channel: { ...LOGITECH_CHANNEL, interface: 3 },
    steps: [hidppVoltageStep([0x07, 0x01], G533_CURVE)],
  },
  {
    name: "Logitech G535",
    kind: "headset",
    vendorId: LOGITECH,
    productIds: [0x0ac4],
    channel: { usagePage: 0x0c, usage: 0x01, interface: 3 },
    steps: [hidppVoltageStep([0x05, 0x0d], G535_CURVE)],
  },
  {
    name: "Logitech G PRO",
    kind: "headset",
    vendorId: LOGITECH,
    productIds: [0x0aa7, 0x0aaa, 0x0aba, 0x0afb, 0x0afc],
    channel: LOGITECH_CHANNEL,
    steps: [hidppVoltageStep([0x06, 0x0d], GPRO_CURVE)],
  },
  {
    name: "SteelSeries Rival 3 Wireless",
    kind: "mouse",
    vendorId: STEELSERIES,
    productIds: [0x1830, 0x1872],
    channel: { interface: 3 },
    steps: [{ request: [0x00, 0xaa, 0x01], parse: (frame) => frame.length < 3 ? null : frame[0] > 100 ? OFFLINE : { capacity: frame[0], charging: !!frame[2] } }],
  },
  {
    name: "SteelSeries Aerox and Prime Wireless",
    kind: "mouse",
    vendorId: STEELSERIES,
    productIds: [0x1838, 0x1878, 0x1852, 0x185c, 0x1860, 0x1858, 0x1874, 0x1840, 0x1848],
    channel: { interface: 3 },
    steps: [{ request: [0x00, 0xd2], parse: aeroxBattery }],
  },
  {
    name: "SteelSeries Aerox and Prime Wireless (cable)",
    kind: "mouse",
    wired: true,
    vendorId: STEELSERIES,
    productIds: [0x183a, 0x187a, 0x1854, 0x185e, 0x1862, 0x185a, 0x1876, 0x1842, 0x184a],
    channel: { interface: 3 },
    steps: [{ request: [0x00, 0x92], parse: aeroxBattery }],
  },
];

export function find(device) {
  return DEVICES.find(
    (entry) => entry.vendorId === device.vendorId && entry.productIds.includes(device.productId),
  ) ?? null;
}
