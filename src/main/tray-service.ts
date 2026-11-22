import { Menu, Tray, nativeImage } from "electron";
import { join } from "node:path";
import type { Logger } from "./logger";
import type { TrayContribution } from "./plugin/types";
import type { WindowManager } from "./window-manager";

export class TrayService {
  private tray: Tray | null = null;
  private readonly providers = new Set<() => TrayContribution | null>();

  constructor(
    private readonly windows: WindowManager,
    private readonly quit: () => void,
    private readonly logger: Logger,
  ) {}

  contribute(provider: () => TrayContribution | null): () => void {
    this.providers.add(provider);
    this.rebuild();
    return () => {
      this.providers.delete(provider);
      this.rebuild();
    };
  }

  refresh(): void {
    this.rebuild();
  }

  init(): void {
    if (this.tray) {
      return;
    }
    const iconPath = join(__dirname, "../../resources/tray.png");
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
    this.tray = new Tray(icon);
    this.tray.setToolTip("独去闲工具箱");
    this.logger.info("托盘已初始化");
    this.tray.on("click", () => {
      void this.windows.showMain();
    });
    this.rebuild();
  }

  dispose(): void {
    this.tray?.destroy();
    this.tray = null;
    this.logger.info("托盘已释放");
  }

  private contributions(): TrayContribution[] {
    const result: TrayContribution[] = [];
    for (const provider of this.providers) {
      try {
        const contribution = provider();
        if (contribution) {
          result.push(contribution);
        }
      } catch (error) {
        this.logger.error("托盘贡献项生成失败", { error });
        console.error("托盘贡献项生成失败", error);
      }
    }
    return result;
  }

  private rebuild(): void {
    if (!this.tray) {
      return;
    }
    const sections = this.contributions();
    const tooltip = [
      "独去闲工具箱",
      ...sections.flatMap((section) => section.tooltipLines ?? []),
    ].join("\n");
    const items = sections.flatMap((section) => section.items ?? []);

    const template: Electron.MenuItemConstructorOptions[] = [];
    if (items.length > 0) {
      template.push(...items, { type: "separator" });
    }
    template.push(
      {
        label: "设置",
        click: () => {
          void this.windows.showMain("settings");
        },
      },
      {
        label: "打开主窗口",
        click: () => {
          void this.windows.showMain();
        },
      },
      { type: "separator" },
      {
        label: "退出",
        click: this.quit,
      },
    );

    this.tray.setToolTip(tooltip);
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }
}
