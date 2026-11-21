import { globalShortcut } from "electron";
import { buildHotkeyCandidates } from "../shared/hotkey";

export class HotkeyService {
  private readonly registered = new Map<string, () => void>();

  register(
    accelerator: string,
    handler: () => void,
  ): { ok: boolean; error?: string } {
    try {
      if (!globalShortcut.register(accelerator, handler)) {
        return {
          ok: false,
          error: `无法注册快捷键 ${accelerator}，可能已被其他程序占用`,
        };
      }
      this.registered.set(accelerator, handler);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: `快捷键 ${accelerator} 无效：${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  /** 试注册后立即注销，用于在保存前检测是否被其他程序或系统占用。 */
  probe(accelerator: string): { ok: boolean; error?: string } {
    if (this.registered.has(accelerator)) {
      return { ok: true };
    }
    try {
      if (!globalShortcut.register(accelerator, () => {})) {
        return {
          ok: false,
          error: `快捷键 ${accelerator} 已被其他程序或系统占用`,
        };
      }
      globalShortcut.unregister(accelerator);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: `快捷键 ${accelerator} 无效：${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }

  suggest(accelerator: string, exclude: string[] = [], limit = 3): string[] {
    const suggestions: string[] = [];
    const candidates = buildHotkeyCandidates(
      accelerator,
      Math.max(12, limit * 4),
    );
    for (const candidate of candidates) {
      if (exclude.includes(candidate)) {
        continue;
      }
      if (this.probe(candidate).ok) {
        suggestions.push(candidate);
        if (suggestions.length >= limit) {
          break;
        }
      }
    }
    return suggestions;
  }

  unregister(accelerator: string): void {
    if (!this.registered.has(accelerator)) {
      return;
    }
    globalShortcut.unregister(accelerator);
    this.registered.delete(accelerator);
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll();
    this.registered.clear();
  }
}
