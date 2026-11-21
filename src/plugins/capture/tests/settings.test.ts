import { describe, expect, it } from "vitest";
import {
  createDefaultCaptureSettings,
  isValidHotkey,
  normalizeHotkey,
  sanitizeCaptureSettings,
} from "../shared/settings";

describe("settings validation", () => {
  it("accepts a modifier and key combination", () => {
    expect(isValidHotkey("Ctrl+Shift+A")).toBe(true);
    expect(isValidHotkey("Alt+Q")).toBe(true);
  });

  it("rejects typing-only or shift-only shortcuts", () => {
    expect(isValidHotkey("A")).toBe(false);
    expect(isValidHotkey("Shift+A")).toBe(false);
    expect(isValidHotkey("Ctrl+Shift")).toBe(false);
  });

  it("normalizes Control to Ctrl", () => {
    expect(normalizeHotkey("Control+Shift+A")).toBe("Ctrl+Shift+A");
  });

  it("recovers invalid persisted settings", () => {
    const defaults = createDefaultCaptureSettings("C:\\Pictures\\工具箱截图");
    expect(
      sanitizeCaptureSettings(
        {
          hotkey: "Shift+A",
          captureCursor: "yes",
          theme: "neon",
        },
        defaults,
      ),
    ).toEqual(defaults);
  });
});

