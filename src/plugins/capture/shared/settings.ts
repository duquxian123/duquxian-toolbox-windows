import type { CaptureSettings } from "./types";

export const DEFAULT_HOTKEY = "Ctrl+Shift+A";

const modifierNames = new Set([
  "Ctrl",
  "Control",
  "Alt",
  "Shift",
  "Super",
  "Meta",
  "Command",
  "CommandOrControl",
]);

export function isValidHotkey(value: string): boolean {
  const parts = value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2 || parts.length > 4) {
    return false;
  }

  const key = parts.at(-1);
  const modifiers = parts.slice(0, -1);
  return (
    Boolean(key) &&
    !modifierNames.has(key!) &&
    key!.length <= 20 &&
    modifiers.every((modifier) => modifierNames.has(modifier)) &&
    new Set(modifiers).size === modifiers.length &&
    modifiers.some((modifier) => modifier !== "Shift")
  );
}

export function normalizeHotkey(value: string): string {
  return value
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part === "Control" ? "Ctrl" : part))
    .join("+");
}

export function createDefaultCaptureSettings(
  saveDirectory: string,
): CaptureSettings {
  return {
    version: 1,
    hotkey: DEFAULT_HOTKEY,
    captureCursor: false,
    autoCopy: false,
    saveDirectory,
  };
}

export function sanitizeCaptureSettings(
  value: unknown,
  fallback: CaptureSettings,
): CaptureSettings {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }

  const candidate = value as Partial<CaptureSettings>;
  const hotkey =
    typeof candidate.hotkey === "string" && isValidHotkey(candidate.hotkey)
      ? normalizeHotkey(candidate.hotkey)
      : fallback.hotkey;
  const saveDirectory =
    typeof candidate.saveDirectory === "string" &&
    candidate.saveDirectory.trim().length > 0
      ? candidate.saveDirectory
      : fallback.saveDirectory;

  return {
    version: 1,
    hotkey,
    captureCursor:
      typeof candidate.captureCursor === "boolean"
        ? candidate.captureCursor
        : fallback.captureCursor,
    autoCopy:
      typeof candidate.autoCopy === "boolean"
        ? candidate.autoCopy
        : fallback.autoCopy,
    saveDirectory,
  };
}
