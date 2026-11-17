import { app } from "electron";
import { join } from "node:path";
import {
  createDefaultSettings,
  isValidHotkey,
  normalizeHotkey,
  sanitizeSettings,
} from "../shared/settings";
import type { AppSettings } from "../shared/types";
import { atomicJsonWrite, readJson } from "./fs-utils";

export class SettingsService {
  readonly filePath = join(app.getPath("userData"), "settings.json");
  private settings: AppSettings;

  private constructor(settings: AppSettings) {
    this.settings = settings;
  }

  static async create(): Promise<SettingsService> {
    const defaultSaveDirectory = join(app.getPath("pictures"), "独去闲工具箱截图");
    const defaults = createDefaultSettings(defaultSaveDirectory);
    let stored: unknown = null;
    try {
      stored = await readJson<unknown>(join(app.getPath("userData"), "settings.json"));
    } catch (error) {
      console.warn("设置文件读取失败，将使用默认设置", error);
    }

    const sanitized = sanitizeSettings(stored, defaults);
    const service = new SettingsService(sanitized);
    await service.persist();
    return service;
  }

  get(): AppSettings {
    return { ...this.settings };
  }

  async update(patch: Partial<AppSettings>): Promise<AppSettings> {
    const candidate = { ...this.settings, ...patch, version: 1 as const };
    if (patch.hotkey !== undefined) {
      if (!isValidHotkey(patch.hotkey)) {
        throw new Error("快捷键格式无效，请至少包含一个 Ctrl、Alt 或 Super 修饰键");
      }
      candidate.hotkey = normalizeHotkey(patch.hotkey);
    }
    if (
      patch.saveDirectory !== undefined &&
      (typeof patch.saveDirectory !== "string" || patch.saveDirectory.trim().length === 0)
    ) {
      throw new Error("保存目录不能为空");
    }

    this.settings = sanitizeSettings(candidate, this.settings);
    await this.persist();
    return this.get();
  }

  private async persist(): Promise<void> {
    await atomicJsonWrite(this.filePath, this.settings);
  }
}

