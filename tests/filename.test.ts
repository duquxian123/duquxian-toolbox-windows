import { describe, expect, it } from "vitest";
import { formatCaptureTimestamp, nextAvailableFilename } from "../src/shared/filename";

describe("file naming", () => {
  it("formats local capture timestamps", () => {
    expect(formatCaptureTimestamp(new Date(2026, 10, 17, 8, 4, 9))).toBe(
      "2026-11-17_08-04-09",
    );
  });

  it("adds a suffix when the filename exists", () => {
    const existing = new Set([
      "C:\\shots\\2026-11-17_08-04-09.png",
      "C:\\shots\\2026-11-17_08-04-09-2.png",
    ]);
    expect(
      nextAvailableFilename(
        "C:\\shots",
        "2026-11-17_08-04-09",
        ".png",
        (path) => existing.has(path),
      ),
    ).toBe("C:\\shots\\2026-11-17_08-04-09-3.png");
  });
});
