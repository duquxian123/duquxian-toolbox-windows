import { describe, expect, it } from "vitest";
import { buildHotkeyCandidates, parseHotkey } from "../src/shared/hotkey";

describe("parseHotkey", () => {
  it("parses modifiers and main key", () => {
    expect(parseHotkey("Ctrl+Shift+A")).toEqual({
      modifiers: ["Ctrl", "Shift"],
      key: "A",
    });
  });

  it("accepts Electron modifier aliases", () => {
    expect(parseHotkey("CommandOrControl+Alt+F1")).toEqual({
      modifiers: ["CommandOrControl", "Alt"],
      key: "F1",
    });
  });

  it("rejects accords without a modifier or main key", () => {
    expect(parseHotkey("A")).toBeNull();
    expect(parseHotkey("Ctrl")).toBeNull();
    expect(parseHotkey("Ctrl+Shift")).toBeNull();
    expect(parseHotkey("Ctrl+Foo+A")).toBeNull();
  });
});

describe("buildHotkeyCandidates", () => {
  it("skips the original accord and returns unique candidates", () => {
    const candidates = buildHotkeyCandidates("Ctrl+Shift+A", 6);
    expect(candidates).toHaveLength(6);
    expect(candidates).not.toContain("Ctrl+Shift+A");
    expect(new Set(candidates).size).toBe(candidates.length);
    expect(candidates[0]).toBe("Ctrl+Shift+B");
  });

  it("keeps one modifier group per candidate batch", () => {
    const candidates = buildHotkeyCandidates("Ctrl+Shift+A", 12);
    expect(
      candidates.every((candidate) => candidate.startsWith("Ctrl+Shift+")),
    ).toBe(true);
  });

  it("falls back to an A-based candidate when the input is invalid", () => {
    const candidates = buildHotkeyCandidates("invalid", 3);
    expect(candidates).toEqual(["Ctrl+Shift+A", "Ctrl+Shift+B", "Ctrl+Shift+C"]);
  });
});
