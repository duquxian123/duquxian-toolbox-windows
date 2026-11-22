import { describe, expect, it } from "vitest";
import { parseFrame } from "../main/hid/drivers/mosart";

describe("MOSART 1A81:1202 battery report", () => {
  it("removes the status bit from the battery percentage", () => {
    expect(parseFrame([0, 0, 0, 0, 0, 0, 0, 0xc9, 0])).toEqual({
      capacity: 73,
      charging: null,
      voltageMv: null,
      raw: [0, 0, 0, 0, 0, 0, 0, 0xc9, 0],
    });
  });

  it("accepts an unflagged percentage and rejects invalid levels", () => {
    expect(parseFrame([0, 0, 0, 0, 0, 0, 0, 73, 0])?.capacity).toBe(73);
    expect(parseFrame([0, 0, 0, 0, 0, 0, 0, 0x80, 0])).toBeNull();
    expect(parseFrame([0, 0, 0, 0, 0, 0, 0, 0xff, 0])).toBeNull();
    expect(parseFrame([0, 0, 0, 0, 0, 0, 0, 73])).toBeNull();
  });
});
