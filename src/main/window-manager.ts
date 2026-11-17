import { BrowserWindow, type WebContents } from "electron";
import { join } from "node:path";
import type { PinInfo, Rectangle } from "../shared/types";

type WindowRole = "main" | "capture" | "pin";

export class WindowManager {
  mainWindow: BrowserWindow | null = null;
  captureWindow: BrowserWindow | null = null;
  private readonly pins = new Map<string, BrowserWindow>();
  private readonly roles = new WeakMap<WebContents, WindowRole>();
  private quitting = false;

  constructor(private readonly preloadPath = join(__dirname, "../preload/index.cjs")) {}

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

  async createCaptureWindow(
    sessionId: string,
    bounds: Rectangle,
    initialSelection: Rectangle | null,
    onClosed: () => void,
  ): Promise<BrowserWindow> {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      throw new Error("截图覆盖层已存在");
    }

    const window = new BrowserWindow({
      ...bounds,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: "#00000000",
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: false,
      roundedCorners: false,
      enableLargerThanScreen: true,
      webPreferences: this.webPreferences(),
    });
    this.captureWindow = window;
    this.roles.set(window.webContents, "capture");
    this.hardenWindow(window);
    window.setAlwaysOnTop(true, "screen-saver");
    window.on("closed", () => {
      if (this.captureWindow === window) {
        this.captureWindow = null;
      }
      onClosed();
    });
    await this.loadRoute(window, {
      view: "capture",
      sessionId,
      initialSelection: initialSelection ? "1" : "0",
    });
    if (!window.isDestroyed()) {
      window.show();
      window.setBounds({
        x: Math.round(bounds.x),
        y: Math.round(bounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      });
      window.setAlwaysOnTop(true, "screen-saver");
      window.focus();
    }
    return window;
  }

  closeCaptureWindow(): void {
    if (this.captureWindow && !this.captureWindow.isDestroyed()) {
      this.captureWindow.close();
    }
    this.captureWindow = null;
  }

  async createPinWindow(pin: PinInfo, onClosed?: () => void): Promise<void> {
    const maxWidth = 720;
    const maxHeight = 540;
    const ratio = Math.min(maxWidth / pin.width, maxHeight / pin.height, 1);
    const width = Math.max(140, Math.round(pin.width * ratio));
    const height = Math.max(90, Math.round(pin.height * ratio));
    const existing = this.pins.get(pin.id);
    if (existing && !existing.isDestroyed()) {
      existing.show();
      existing.focus();
      return;
    }

    const window = new BrowserWindow({
      width,
      height,
      minWidth: 120,
      minHeight: 80,
      frame: false,
      show: false,
      title: "贴图",
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      hasShadow: true,
      backgroundColor: "#FBF8F2",
      webPreferences: this.webPreferences(),
    });
    this.pins.set(pin.id, window);
    this.roles.set(window.webContents, "pin");
    this.hardenWindow(window);
    window.setAlwaysOnTop(true, "floating");
    window.setAspectRatio(pin.width / pin.height);
    window.on("closed", () => {
      this.pins.delete(pin.id);
      onClosed?.();
    });
    await this.loadRoute(window, { view: "pin", pinId: pin.id });
    if (!window.isDestroyed()) {
      window.show();
      window.focus();
    }
  }

  closePin(pinId: string): void {
    const window = this.pins.get(pinId);
    if (window && !window.isDestroyed()) {
      window.close();
    }
    this.pins.delete(pinId);
  }

  prepareToQuit(): void {
    this.quitting = true;
  }

  roleFor(contents: WebContents): WindowRole | null {
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

