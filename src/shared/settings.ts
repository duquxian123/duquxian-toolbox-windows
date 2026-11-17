import type { AppSettings, ThemeMode } from "./types";

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

export function createDefaultSettings(saveDirectory: string): AppSettings {
  return {
    version: 1,
    hotkey: DEFAULT_HOTKEY,
    captureCursor: false,
    autoCopy: false,
    launchAtLogin: false,
    saveDirectory,
    theme: "system",
  };
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function sanitizeSettings(
  value: unknown,
  defaultValue: AppSettings,
): AppSettings {
  if (!value || typeof value !== "object") {
    return { ...defaultValue };
  }

  const candidate = value as Partial<AppSettings>;
  const hotkey =
    typeof candidate.hotkey === "string" && isValidHotkey(candidate.hotkey)
      ? normalizeHotkey(candidate.hotkey)
      : defaultValue.hotkey;
  const saveDirectory =
    typeof candidate.saveDirectory === "string" &&
    candidate.saveDirectory.trim().length > 0
      ? candidate.saveDirectory
      : defaultValue.saveDirectory;

  return {
    version: 1,
    hotkey,
    captureCursor:
      typeof candidate.captureCursor === "boolean"
        ? candidate.captureCursor
        : defaultValue.captureCursor,
    autoCopy:
      typeof candidate.autoCopy === "boolean" ? candidate.autoCopy : defaultValue.autoCopy,
    launchAtLogin:
      typeof candidate.launchAtLogin === "boolean"
        ? candidate.launchAtLogin
        : defaultValue.launchAtLogin,
    saveDirectory,
    theme: isThemeMode(candidate.theme) ? candidate.theme : defaultValue.theme,
  };
}

