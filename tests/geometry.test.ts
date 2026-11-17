import { describe, expect, it } from "vitest";
import {
  getDisplayCrop,
  intersectRects,
  localizeRect,
  normalizeRect,
  unionRects,
} from "../src/shared/geometry";

describe("capture geometry", () => {
  it("normalizes reverse drags", () => {
    expect(normalizeRect({ x: 120, y: 80 }, { x: 20, y: 30 })).toEqual({
      x: 20,
      y: 30,
      width: 100,
      height: 50,
    });
  });

  it("builds a virtual desktop with negative display coordinates", () => {
    const union = unionRects([
      { x: -1920, y: -160, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 2560, height: 1440 },
    ]);
    expect(union).toEqual({ x: -1920, y: -160, width: 4480, height: 1600 });
    expect(localizeRect({ x: 0, y: 0, width: 2560, height: 1440 }, union)).toEqual({
      x: 1920,
      y: 160,
      width: 2560,
      height: 1440,
    });
  });

  it("intersects only valid overlapping regions", () => {
    expect(
      intersectRects(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 80, y: 20, width: 50, height: 50 },
      ),
    ).toEqual({ x: 80, y: 20, width: 20, height: 50 });
    expect(
      intersectRects(
        { x: 0, y: 0, width: 100, height: 100 },
        { x: 120, y: 20, width: 50, height: 50 },
      ),
    ).toBeNull();
  });

  it("maps a crop from a 150% display to physical pixels", () => {
    const crop = getDisplayCrop(
      { x: 20, y: 10, width: 200, height: 100 },
      {
        globalBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        localBounds: { x: 0, y: 0, width: 1920, height: 1080 },
        scaleFactor: 1.5,
      },
      { x: 0, y: 0 },
      1.5,
    );
    expect(crop?.source).toEqual({ x: 30, y: 15, width: 300, height: 150 });
    expect(crop?.destination).toEqual({ x: 0, y: 0, width: 300, height: 150 });
  });

  it("stitches mixed-DPI displays at the highest scale", () => {
    const crop = getDisplayCrop(
      { x: 0, y: 0, width: 300, height: 100 },
      {
        globalBounds: { x: 100, y: 0, width: 200, height: 100 },
        localBounds: { x: 100, y: 0, width: 200, height: 100 },
        scaleFactor: 1,
      },
      { x: 0, y: 0 },
      2,
    );
    expect(crop?.source).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(crop?.destination).toEqual({ x: 200, y: 0, width: 400, height: 200 });
  });
});

