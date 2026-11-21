import { app } from "electron";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { atomicJsonWrite, readJson } from "../../../main/fs-utils";
import {
  createDefaultCaptureSettings,
  isValidHotkey,
  normalizeHotkey,
  sanitizeCaptureSettings,
} from "../shared/settings";
import type { CaptureSettings } from "../shared/types";

export class CaptureSettingsStore {
  readonly filePath: string;
  private settings: CaptureSettings;

  private constructor(
    rootDir: string,
    settings: CaptureSettings,
  ) {
    this.filePath = join(rootDir, "settings.json");
    this.settings = settings;
  }

  static async create(rootDir: string): Promise<CaptureSettingsStore> {
    const defaults = createDefaultCaptureSettings(
      join(app.getPath("pictures"), "独去闲工具箱截图"),
    );

    let stored: unknown = null;
    try {
      stored = await readJson<unknown>(join(rootDir, "settings.json"));
    } catch (error) {
      console.warn("截图设置读取失败，将使用默认设置", error);
    }
    let migrated = false;
    if (!stored) {
      try {
        stored = await readJson<unknown>(
          join(app.getPath("userData"), "settings.json"),
        );
        migrated = stored !== null;
      } catch {
        stored = null;
      }
    }

    const store = new CaptureSettingsStore(
      rootDir,
      sanitizeCaptureSettings(stored, defaults),
    );
    await store.persist();
    if (migrated) {
      await rm(join(app.getPath("userData"), "settings.json"), {
        force: true,
      });
    }
    return store;
  }

  get(): CaptureSettings {
    return { ...this.settings };
  }

  async update(patch: Partial<CaptureSettings>): Promise<CaptureSettings> {
    const candidate = { ...this.settings, ...patch, version: 1 as const };
    if (patch.hotkey !== undefined) {
      if (!isValidHotkey(patch.hotkey)) {
        throw new Error("快捷键格式无效，请至少包含一个 Ctrl、Alt 或 Super 修饰键");
      }
      candidate.hotkey = normalizeHotkey(patch.hotkey);
    }
    if (
      patch.saveDirectory !== undefined &&
      (typeof patch.saveDirectory !== "string" ||
        patch.saveDirectory.trim().length === 0)
    ) {
      throw new Error("保存目录不能为空");
    }

    this.settings = sanitizeCaptureSettings(candidate, this.settings);
    await this.persist();
    return this.get();
  }

  private async persist(): Promise<void> {
    await atomicJsonWrite(this.filePath, this.settings);
  }
}
