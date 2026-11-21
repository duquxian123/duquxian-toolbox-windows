import type { CoreSettings, ThemeMode } from "./types";

export function createDefaultCoreSettings(): CoreSettings {
  return {
    version: 1,
    theme: "system",
    launchAtLogin: false,
  };
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

export function sanitizeCoreSettings(
  value: unknown,
  fallback: CoreSettings,
): CoreSettings {
  if (!value || typeof value !== "object") {
    return { ...fallback };
  }

  const candidate = value as Partial<CoreSettings>;
  return {
    version: 1,
    theme: isThemeMode(candidate.theme) ? candidate.theme : fallback.theme,
    launchAtLogin:
      typeof candidate.launchAtLogin === "boolean"
        ? candidate.launchAtLogin
        : fallback.launchAtLogin,
  };
}
