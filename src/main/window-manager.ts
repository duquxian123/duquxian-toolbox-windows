import { BrowserWindow, type WebContents } from "electron";
import { join } from "node:path";
import type { PluginWindowSpec } from "./plugin/types";

export class WindowManager {
  mainWindow: BrowserWindow | null = null;
  private readonly roles = new WeakMap<WebContents, string>();
  private quitting = false;

  constructor(
    private readonly preloadPath = join(__dirname, "../preload/index.cjs"),
  ) {}

  createMainWindow(): BrowserWindow {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow;
    }

    const window = new BrowserWindow({
      width: 1180,
      height: 780,
      minWidth: 860,
      minHeight: 620,
      show: false,
      title: "独去闲工具箱",
      icon: join(__dirname, "../../resources/icon.png"),
      backgroundColor: "#f4f6f2",
      autoHideMenuBar: true,
      webPreferences: this.webPreferences(),
    });
    this.roles.set(window.webContents, "main");
    this.mainWindow = window;
    this.hardenWindow(window);
    window.once("ready-to-show", () => {
      if (!window.isDestroyed()) {
        window.show();
      }
    });
    window.on("close", (event) => {
      if (!this.quitting) {
        event.preventDefault();
        window.hide();
      }
    });
    void this.loadRoute(window);
    return window;
  }

  async showMain(section?: string): Promise<void> {
    const window = this.createMainWindow();
    if (window.isMinimized()) {
      window.restore();
    }
    window.show();
    window.focus();
    if (section) {
      window.webContents.send("toolbox:navigate", section);
    }
  }

  hideMain(): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.hide();
    }
  }

  async create(spec: PluginWindowSpec): Promise<BrowserWindow> {
    const {
      role,
      view,
      params = {},
      bounds,
      show = false,
      options = {},
      onClosed,
    } = spec;
    const window = new BrowserWindow({
      width: bounds?.width ?? 800,
      height: bounds?.height ?? 600,
      ...(bounds
        ? {
            x: Math.round(bounds.x),
            y: Math.round(bounds.y),
            enableLargerThanScreen: true,
          }
        : {}),
      show: false,
      autoHideMenuBar: true,
      ...options,
      webPreferences: {
        ...this.webPreferences(),
        ...(options.webPreferences ?? {}),
      },
    });
    this.roles.set(window.webContents, role);
    this.hardenWindow(window);
    if (onClosed) {
      window.on("closed", onClosed);
    }
    await this.loadRoute(window, {
      ...params,
      ...(view ? { view } : {}),
    });
    if (show && !window.isDestroyed()) {
      window.show();
    }
    return window;
  }

  close(window: BrowserWindow): void {
    if (!window.isDestroyed()) {
      window.close();
    }
  }

  prepareToQuit(): void {
    this.quitting = true;
  }

  roleFor(contents: WebContents): string | null {
    return this.roles.get(contents) ?? null;
  }

  private webPreferences(): Electron.WebPreferences {
    return {
      preload: this.preloadPath,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    };
  }

  private hardenWindow(window: BrowserWindow): void {
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event, url) => {
      const allowedPrefix = process.env.ELECTRON_RENDERER_URL ?? "toolbox://app/";
      if (!url.startsWith(allowedPrefix)) {
        event.preventDefault();
      }
    });
  }

  private async loadRoute(
    window: BrowserWindow,
    query: Record<string, string> = {},
  ): Promise<void> {
    const params = new URLSearchParams(query);
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      params.forEach((value, key) => url.searchParams.set(key, value));
      await window.loadURL(url.toString());
      return;
    }
    await window.loadURL(`toolbox://app/index.html?${params.toString()}`);
  }
}
