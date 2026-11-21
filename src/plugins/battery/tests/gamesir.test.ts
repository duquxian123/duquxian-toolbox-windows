import { describe, expect, it } from "vitest";
import {
  parseFrame,
  QUERY_REPORT,
} from "../main/hid/drivers/gamesir";

function statusFrame(rawBattery: number): number[] {
  const frame = new Array(64).fill(0);
  frame[0] = 0x01;
  frame[1] = 0x4d;
  frame[2] = 0xf4;
  frame[16] = 0x04;
  frame[17] = 0x02;
  frame[18] = rawBattery;
  return frame;
}

describe("GameSir Nova 2 Lite direct HID protocol", () => {
  it("uses the known 65-byte device-info query", () => {
    expect(QUERY_REPORT.length).toBe(65);
    expect(Array.from(QUERY_REPORT.slice(0, 4))).toEqual([0x00, 0x01, 0x01, 0x00]);
  });

  it("reads a normal battery percentage", () => {
    expect(parseFrame(statusFrame(60))).toEqual({
      capacity: 60,
      charging: false,
      voltageMv: null,
    });
  });

  it("interprets raw value 255 as charging at 100 percent", () => {
    expect(parseFrame(statusFrame(255))).toEqual({
      capacity: 100,
      charging: true,
      voltageMv: null,
    });
  });

  it("ignores acknowledgement and invalid battery frames", () => {
    expect(parseFrame([0xf4, 0x00, 0x17])).toBeNull();
    expect(parseFrame(statusFrame(101))).toBeNull();
    expect(parseFrame(statusFrame(254))).toBeNull();

    const wrongStatus = statusFrame(60);
    wrongStatus[17] = 0x03;
    expect(parseFrame(wrongStatus)).toBeNull();
  });
});
