import { app } from "electron";
import { join } from "node:path";
import {
  createDefaultCoreSettings,
  sanitizeCoreSettings,
} from "../shared/settings";
import type { CoreSettings } from "../shared/types";
import { atomicJsonWrite, readJson } from "./fs-utils";
import type { Logger } from "./logger";

export class SettingsService {
  readonly filePath = join(app.getPath("userData"), "app-settings.json");
  private settings: CoreSettings;

  private constructor(
    settings: CoreSettings,
    private readonly logger: Logger | null,
  ) {
    this.settings = settings;
  }

  static async create(logger: Logger | null = null): Promise<SettingsService> {
    const defaults = createDefaultCoreSettings();
    const userData = app.getPath("userData");
    let stored: unknown = null;
    try {
      stored = await readJson<unknown>(join(userData, "app-settings.json"));
    } catch (error) {
      logger?.warn("应用设置读取失败，将使用默认设置", { error });
      console.warn("应用设置读取失败，将使用默认设置", error);
    }

    // 首次升级：从旧 settings.json 迁移框架字段；插件自行迁移其余字段。
    if (!stored) {
      try {
        stored = await readJson<unknown>(join(userData, "settings.json"));
      } catch {
        stored = null;
      }
    }

    const service = new SettingsService(
      sanitizeCoreSettings(stored, defaults),
      logger,
    );
    await service.persist();
    return service;
  }

  get(): CoreSettings {
    return { ...this.settings };
  }

  async update(patch: Partial<CoreSettings>): Promise<CoreSettings> {
    this.settings = sanitizeCoreSettings(
      { ...this.settings, ...patch },
      this.settings,
    );
    await this.persist();
    return this.get();
  }

  private async persist(): Promise<void> {
    await atomicJsonWrite(this.filePath, this.settings);
    this.logger?.info("应用设置已保存", {
      theme: this.settings.theme,
      launchAtLogin: this.settings.launchAtLogin,
    });
  }
}
