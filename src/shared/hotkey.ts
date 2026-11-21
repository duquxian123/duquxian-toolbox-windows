const modifierNames = new Set([
  "Ctrl",
  "Control",
  "Alt",
  "Shift",
  "Super",
  "Meta",
  "Command",
  "CommandOrControl",
  "Cmd",
]);

const modifierGroups: string[][] = [
  ["Ctrl", "Shift"],
  ["Alt", "Shift"],
  ["Ctrl", "Alt"],
  ["Ctrl", "Alt", "Shift"],
  ["Super", "Shift"],
];

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const digits = "0123456789".split("");

export interface ParsedHotkey {
  modifiers: string[];
  key: string;
}

export function parseHotkey(accelerator: string): ParsedHotkey | null {
  const parts = accelerator
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const key = parts.at(-1);
  if (!key || modifierNames.has(key) || key.length > 20) {
    return null;
  }
  const modifiers = parts.slice(0, -1);
  if (modifiers.some((modifier) => !modifierNames.has(modifier))) {
    return null;
  }
  return { modifiers, key };
}

/** 生成替代组合：优先保持主键，依次替换修饰键，再尝试其它字母与数字。 */
export function buildHotkeyCandidates(
  accelerator: string,
  limit = 12,
): string[] {
  const key = parseHotkey(accelerator)?.key ?? "A";
  const keys = [key, ...letters.filter((item) => item !== key), ...digits];
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const modifiers of modifierGroups) {
    for (const item of keys) {
      const candidate = [...modifiers, item].join("+");
      if (candidate === accelerator || seen.has(candidate)) {
        continue;
      }
      seen.add(candidate);
      candidates.push(candidate);
      if (candidates.length >= limit) {
        return candidates;
      }
    }
  }
  return candidates;
}
