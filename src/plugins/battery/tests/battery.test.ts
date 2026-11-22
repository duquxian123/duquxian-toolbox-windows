import { describe, expect, it } from "vitest";
import { parseFrame as parseJzM7Frame } from "../main/hid/drivers/jzm7";
import {
  estimateHoursLeft,
  lastChargedAt,
} from "../main/estimate";
import {
  HISTORY_MAX_POINTS,
  pushBatteryHistory,
} from "../main/history";
import {
  DEFAULT_BATTERY_SETTINGS,
  sanitizeBatterySettings,
} from "../main/settings";
import { migrateDevices } from "../main/store";
import { frameToReading } from "../main/hid/scale";
import {
  batteryReadingDetails,
  outOfRangeRawPercent,
} from "../main/logging";

describe("Battery Hub integration", () => {
  it("reads JZ M7 battery byte 8 and rejects unrelated reports", () => {
    const report = [0xa1, 0x50, 1, 3, 14, 2, 4, 37, 78, 68, 3, 3, 2, 6, 4, 0, 2, 0, 1];
    expect(parseJzM7Frame(report)?.capacity).toBe(78);
    expect(parseJzM7Frame([0xa1, 0x51, 0, 0, 0, 0, 0, 0, 78])).toBeNull();
    expect(parseJzM7Frame([0xa1, 0x50, 0, 0, 0, 0, 0, 0, 0])).toBeNull();
  });

  it("keeps calibrated raw bytes and flags values outside percent range", () => {
    const profile = {
      usagePage: 0xff02,
      usage: 2,
      reportKind: "feature" as const,
      reportId: 6,
      readLength: 9,
      trigger: null,
      byteOffset: 7,
      scaleMin: 0,
      scaleMax: 100,
    };
    const frame = [0, 0, 0, 0, 0, 0, 0, 201, 0];
    const reading = frameToReading(frame, profile);
    expect(reading).toMatchObject({
      capacity: 100,
      raw: frame,
    });
    expect(outOfRangeRawPercent(reading!, profile)).toBe(201);

    const card = {
      id: "6785:4610:",
      product: "wireless dongle",
      manufacturer: "MOSART Semi.",
      driverId: "generic",
      profile,
      customName: "键盘-ikbc静音红轴",
    };
    expect(batteryReadingDetails(card.id, card, reading!, null)).toMatchObject({
      deviceId: "6785:4610:",
      name: "键盘-ikbc静音红轴",
      driverId: "generic",
      capacity: 100,
      raw: frame,
      rawHex: "00 00 00 00 00 00 00 c9 00",
    });
  });

  it("sanitizes polling and alert settings", () => {
    expect(
      sanitizeBatterySettings({
        pollIntervalSec: 2,
        notifyThreshold: 33,
        density: "compact",
        sortMode: "manual",
      }),
    ).toEqual({
      ...DEFAULT_BATTERY_SETTINGS,
      pollIntervalSec: 10,
      notifyThreshold: 35,
      density: "compact",
      sortMode: "manual",
    });
  });

  it("records charging-aware history and caps its size", () => {
    const now = Date.now();
    const first = pushBatteryHistory([], 78, false, now);
    const unchanged = pushBatteryHistory(first, 78, false, now + 1000);
    expect(unchanged).toHaveLength(1);
    const changed = pushBatteryHistory(unchanged, 77, true, now + 2000);
    expect(changed.at(-1)).toMatchObject({ c: 77, ch: 1 });

    const many = Array.from({ length: HISTORY_MAX_POINTS + 20 }, (_, index) => ({
      t: now - (HISTORY_MAX_POINTS + 20 - index) * 1000,
      c: 100 - (index % 30),
      ch: 0 as const,
    }));
    expect(pushBatteryHistory(many, 20, false, now).length).toBeLessThanOrEqual(
      HISTORY_MAX_POINTS,
    );
  });

  it("estimates time left from discharge history and finds the last charge", () => {
    const now = Date.now();
    const history = [
      { t: now - 5 * 3_600_000, c: 80, ch: 0 as const },
      { t: now - 3 * 3_600_000, c: 70, ch: 0 as const },
      { t: now - 2 * 3_600_000, c: 95, ch: 1 as const },
      { t: now - 1 * 3_600_000, c: 90, ch: 0 as const },
    ];
    expect(estimateHoursLeft(history, 10)).toBe(2);
    expect(lastChargedAt(history)).toBe(now - 2 * 3_600_000);
  });

  it("migrates device configuration without history or module settings", () => {
    const migrated = migrateDevices({
      devices: {
        "13979:1268:DG20250623": {
          id: "13979:1268:DG20250623",
          product: "JZ M7 Receiver",
          manufacturer: "ITON Corp.",
          driverId: "jzm7",
          customName: "我的鼠标",
          lastReading: { capacity: 78, charging: false },
          history: [{ t: 1, c: 78, ch: 0 }],
          lastError: "timeout",
        },
      },
      settings: { pollIntervalSec: 10 },
    });
    expect(migrated["13979:1268:DG20250623"]).toMatchObject({
      product: "JZ M7 Receiver",
      driverId: "jzm7",
      customName: "我的鼠标",
    });
    expect(migrated["13979:1268:DG20250623"].lastReading).toBeUndefined();
    expect(migrated["13979:1268:DG20250623"].history).toBeUndefined();
    expect(migrated["13979:1268:DG20250623"].lastError).toBeUndefined();
  });
});
