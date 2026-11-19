import {
  app,
  dialog,
  globalShortcut,
  ipcMain,
  Notification,
  Tray,
  Menu,
  clipboard,
  ClipboardItem,
  nativeImage,
} from "electron";
import { join, dirname } from "node:path";
import { readFile, rm } from "node:fs/promises";
import type {
  AppSettings,
  BatteryAddRequest,
  CaptureMode,
  CommitRequest,
  PinInfo,
  SettingsUpdateResult,
} from "../shared/types";
import { BatteryManager } from "./battery/manager";
import { BatteryNotifier } from "./battery/notifier";
import { BatteryStore } from "./battery/store";
import { CaptureService } from "./capture-service";
import { errorMessage } from "./fs-utils";
import { installToolboxProtocol, registerToolboxScheme } from "./protocol";
import { SettingsService } from "./settings-service";
import { WindowManager } from "./window-manager";

registerToolboxScheme();

if (process.env.TOOLBOX_TEST_USER_DATA) {
  app.setPath("userData", process.env.TOOLBOX_TEST_USER_DATA);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

let settings: SettingsService;
let windows: WindowManager;
let capture: CaptureService;
let batteryStore: BatteryStore;
let batteryManager: BatteryManager;
let tray: Tray | null = null;
let hotkeyError: string | null = null;
let quitting = false;
const pins = new Map<string, PinInfo>();

app.on("second-instance", () => {
  void windows?.showMain();
});

app.on("window-all-closed", () => {
  // The tray keeps the application alive.
});

app.on("activate", () => {
  void windows?.showMain();
});

app.on("before-quit", () => {
  quitting = true;
  windows?.prepareToQuit();
});

app.whenReady().then(initialize).catch((error) => {
  dialog.showErrorBox("独去闲工具箱启动失败", errorMessage(error));
  app.quit();
});

async function initialize(): Promise<void> {
  app.setAppUserModelId("com.duquxian.toolbox.app");
  const userDataPath = app.getPath("userData");
  const sessionsRoot = join(userDataPath, "sessions");
  const pinsRoot = join(userDataPath, "pins");
  await rm(join(userDataPath, "history"), { recursive: true, force: true });
  installToolboxProtocol({
    rendererRoot: join(__dirname, "../renderer"),
    sessionsRoot,
    pinsRoot,
  });

  settings = await SettingsService.create();
  windows = new WindowManager();
  batteryStore = await BatteryStore.create();
  const batteryNotifier = new BatteryNotifier(
    batteryStore,
    () => void windows.showMain("battery"),
  );
  batteryManager = new BatteryManager(batteryStore, batteryNotifier);
  batteryManager.setListeners(
    (device) => {
      if (windows.mainWindow && !windows.mainWindow.isDestroyed()) {
        windows.mainWindow.webContents.send("battery:update", device);
      }
      rebuildTrayMenu();
    },
    () => {
      if (windows.mainWindow && !windows.mainWindow.isDestroyed()) {
        windows.mainWindow.webContents.send("battery:devices-changed");
      }
      rebuildTrayMenu();
    },
  );
  capture = new CaptureService(
    windows,
    settings,
    userDataPath,
    pinsRoot,
    async (pin) => {
      pins.set(pin.id, pin);
      await windows.createPinWindow(pin, () => {
        pins.delete(pin.id);
        void rm(dirname(pin.imagePath), { recursive: true, force: true });
      });
      return pin;
    },
  );
  await capture.initialize();
  windows.createMainWindow();
  registerIpcHandlers();
  registerHotkey(settings.get().hotkey);
  createTray();
  applyLoginItem(settings.get().launchAtLogin);
  void batteryManager.start().catch((error) => {
    console.error("电量模块启动失败", error);
  });
}

function registerHotkey(hotkey: string): { ok: boolean; error?: string } {
  try {
    globalShortcut.unregisterAll();
    const registered = globalShortcut.register(hotkey, () => {
      void startCapture("region");
    });
    if (!registered) {
      hotkeyError = `无法注册快捷键 ${hotkey}，可能已被其他程序占用`;
      notifyHotkeyError(hotkeyError);
      return { ok: false, error: hotkeyError };
    }
    hotkeyError = null;
    return { ok: true };
  } catch (error) {
    hotkeyError = `快捷键 ${hotkey} 无效：${errorMessage(error)}`;
    notifyHotkeyError(hotkeyError);
    return { ok: false, error: hotkeyError };
  }
}

function notifyHotkeyError(message: string): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: "截图快捷键不可用",
      body: message,
    });
    notification.on("click", () => {
      void windows.showMain("settings");
    });
    notification.show();
  }
  windows?.mainWindow?.webContents.send("toolbox:hotkey-error", message);
}

async function startCapture(mode: CaptureMode): Promise<void> {
  try {
    if (mode === "repeat") {
      await capture.startRepeat();
    } else {
      await capture.start(mode);
    }
  } catch (error) {
    const message = errorMessage(error);
    console.error("截图失败", error);
    if (Notification.isSupported()) {
      new Notification({
        title: "截图失败",
        body: message,
      }).show();
    }
    windows?.mainWindow?.webContents.send("toolbox:capture-error", message);
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle("toolbox:get-bootstrap", (event) => {
    assertMainSender(event.sender);
    return {
      settings: settings.get(),
      hotkeyError,
      platform: process.platform,
      version: app.getVersion(),
    };
  });

  ipcMain.handle("capture:start", async (event, mode: CaptureMode) => {
    assertMainSender(event.sender);
    if (!["region", "repeat", "fullscreen"].includes(mode)) {
      throw new Error("截图模式无效");
    }
    try {
      if (mode === "repeat") {
        await capture.startRepeat();
      } else {
        await capture.start(mode);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorMessage(error) };
    }
  });

  ipcMain.handle("capture:get-session", (event, sessionId: string) => {
    assertCaptureSender(event.sender);
    if (typeof sessionId !== "string") {
      throw new Error("截图会话参数无效");
    }
    return capture.getSession(sessionId);
  });

  ipcMain.handle("capture:commit", async (event, request: CommitRequest) => {
    assertCaptureSender(event.sender);
    if (!request || request.sessionId !== captureCurrentSessionId()) {
      throw new Error("截图会话不匹配");
    }
    return capture.commit(request);
  });

  ipcMain.handle("capture:cancel", async (event, sessionId: string) => {
    assertCaptureSender(event.sender);
    await capture.cancel(sessionId);
  });

  ipcMain.handle("pin:get", async (event, pinId: string) => {
    assertPinSender(event.sender);
    const pin = pins.get(pinId);
    if (!pin) {
      throw new Error("贴图不存在");
    }
    return pin;
  });

  ipcMain.handle("pin:copy", async (event, pinId: string) => {
    assertPinSender(event.sender);
    const pin = pins.get(pinId);
    if (!pin) {
      throw new Error("贴图不存在");
    }
    const path = pin.imagePath;
    const image = nativeImage.createFromBuffer(await readFile(path));
    if (image.isEmpty()) {
      throw new Error("贴图内容无效");
    }
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([await readFile(path)], { type: "image/png" }),
      }),
    ]);
  });

  ipcMain.handle("pin:close", (event, pinId: string) => {
    assertPinSender(event.sender);
    windows.closePin(pinId);
  });

  ipcMain.handle(
    "settings:update",
    async (event, patch: Partial<AppSettings>): Promise<SettingsUpdateResult> => {
      assertMainSender(event.sender);
      if (!patch || typeof patch !== "object") {
        throw new Error("设置参数无效");
      }
      const oldSettings = settings.get();
      const acceptedPatch = { ...patch };
      let registration = { ok: true as boolean, hotkey: oldSettings.hotkey, error: undefined as string | undefined };

      if (typeof patch.hotkey === "string") {
        delete acceptedPatch.hotkey;
        const candidate = patch.hotkey;
        try {
          globalShortcut.unregisterAll();
          const registered = globalShortcut.register(candidate, () => {
            void startCapture("region");
          });
          if (registered) {
            registration = { ok: true, hotkey: candidate, error: undefined };
            acceptedPatch.hotkey = candidate;
          } else {
            registerHotkey(oldSettings.hotkey);
            registration = {
              ok: false,
              hotkey: oldSettings.hotkey,
              error: `无法注册快捷键 ${candidate}，可能已被占用`,
            };
          }
        } catch (error) {
          registerHotkey(oldSettings.hotkey);
          registration = {
            ok: false,
            hotkey: oldSettings.hotkey,
            error: errorMessage(error),
          };
        }
      }

      let updated: AppSettings;
      try {
        updated = await settings.update(acceptedPatch);
      } catch (error) {
        registerHotkey(oldSettings.hotkey);
        throw error;
      }
      if (
        Object.prototype.hasOwnProperty.call(acceptedPatch, "launchAtLogin")
      ) {
        applyLoginItem(updated.launchAtLogin);
      }
      rebuildTrayMenu();
      return { settings: updated, hotkey: registration };
    },
  );

  ipcMain.handle("settings:choose-directory", async (event) => {
    assertMainSender(event.sender);
    const owner = windows.mainWindow;
    const options: Electron.OpenDialogOptions = {
      title: "选择截图保存目录",
      defaultPath: settings.get().saveDirectory,
      properties: ["openDirectory", "createDirectory"],
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("battery:list-candidates", (event) => {
    assertMainSender(event.sender);
    return batteryManager.listCandidates();
  });

  ipcMain.handle("battery:list-devices", (event) => {
    assertMainSender(event.sender);
    return batteryStore.getDevices();
  });

  ipcMain.handle("battery:add", (event, request: BatteryAddRequest) => {
    assertMainSender(event.sender);
    if (
      !request ||
      typeof request.id !== "string" ||
      typeof request.driverId !== "string" ||
      typeof request.product !== "string" ||
      typeof request.manufacturer !== "string"
    ) {
      throw new Error("设备参数无效");
    }
    const device = batteryStore.upsertDevice(request.id, {
      driverId: request.driverId,
      profile: request.profile ?? null,
      product: request.product,
      manufacturer: request.manufacturer,
      hidden: false,
    });
    batteryManager.restart();
    rebuildTrayMenu();
    return device;
  });

  ipcMain.handle("battery:remove", (event, id: string) => {
    assertMainSender(event.sender);
    if (typeof id !== "string") throw new Error("设备参数无效");
    batteryStore.removeDevice(id);
    batteryManager.restart();
    rebuildTrayMenu();
  });

  ipcMain.handle("battery:rename", (event, id: string, name: string) => {
    assertMainSender(event.sender);
    if (typeof id !== "string" || typeof name !== "string") throw new Error("设备参数无效");
    const device = batteryStore.upsertDevice(id, {
      customName: name.trim().slice(0, 40) || null,
    });
    batteryManager.restart();
    rebuildTrayMenu();
    return device;
  });

  ipcMain.handle("battery:set-icon", (event, id: string, icon: string | null) => {
    assertMainSender(event.sender);
    if (typeof id !== "string") throw new Error("设备参数无效");
    const customIcon = typeof icon === "string"
      ? Array.from(icon).slice(0, 4).join("").trim() || null
      : null;
    return batteryStore.upsertDevice(id, { customIcon });
  });

  ipcMain.handle("battery:set-hidden", (event, id: string, hidden: boolean) => {
    assertMainSender(event.sender);
    if (typeof id !== "string") throw new Error("设备参数无效");
    const device = batteryStore.upsertDevice(id, { hidden: !!hidden });
    batteryManager.restart();
    rebuildTrayMenu();
    return device;
  });

  ipcMain.handle("battery:set-alert", (event, id: string, threshold: number | null) => {
    assertMainSender(event.sender);
    if (typeof id !== "string") throw new Error("设备参数无效");
    const numeric = Number(threshold);
    const alertThreshold = threshold == null || Number.isNaN(numeric)
      ? null
      : Math.max(5, Math.min(95, Math.round(numeric / 5) * 5));
    return batteryStore.upsertDevice(id, { alertThreshold });
  });

  ipcMain.handle("battery:reorder", (event, ids: string[]) => {
    assertMainSender(event.sender);
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
      throw new Error("设备顺序无效");
    }
    batteryStore.reorderDevices(ids);
  });

  ipcMain.handle("battery:poll-now", async (event) => {
    assertMainSender(event.sender);
    await batteryManager.pollNow();
  });

  ipcMain.handle("battery:capture", (event, id: string) => {
    assertMainSender(event.sender);
    if (typeof id !== "string") throw new Error("设备参数无效");
    return batteryManager.captureCalibration(id);
  });

  ipcMain.handle("battery:get-settings", (event) => {
    assertMainSender(event.sender);
    return batteryStore.getSettings();
  });

  ipcMain.handle("battery:update-settings", (event, patch) => {
    assertMainSender(event.sender);
    if (!patch || typeof patch !== "object") throw new Error("电量设置无效");
    const updated = batteryManager.updateSettings(patch);
    rebuildTrayMenu();
    return updated;
  });

  ipcMain.handle("battery:diagnostics", (event) => {
    assertMainSender(event.sender);
    return batteryManager.diagnostics();
  });

  ipcMain.handle("app:show-main", async (event, section?: string) => {
    assertKnownSender(event.sender);
    await windows.showMain(section);
  });

  ipcMain.handle("app:quit", (event) => {
    assertKnownSender(event.sender);
    quitting = true;
    windows.prepareToQuit();
    app.quit();
  });
}

function captureCurrentSessionId(): string | null {
  const url = windows.captureWindow?.webContents.getURL();
  if (!url) {
    return null;
  }
  try {
    return new URL(url).searchParams.get("sessionId");
  } catch {
    return null;
  }
}

function assertMainSender(sender: Electron.WebContents): void {
  if (windows.roleFor(sender) !== "main") {
    throw new Error("无权执行此操作");
  }
}

function assertCaptureSender(sender: Electron.WebContents): void {
  if (windows.roleFor(sender) !== "capture") {
    throw new Error("无权执行此操作");
  }
}

function assertPinSender(sender: Electron.WebContents): void {
  if (windows.roleFor(sender) !== "pin") {
    throw new Error("无权执行此操作");
  }
}

function assertKnownSender(sender: Electron.WebContents): void {
  if (!windows.roleFor(sender)) {
    throw new Error("无权执行此操作");
  }
}

function applyLoginItem(openAtLogin: boolean): void {
  const options: Electron.Settings = {
    openAtLogin,
    path: process.execPath,
  };
  if (!app.isPackaged) {
    options.args = [app.getAppPath()];
  }
  app.setLoginItemSettings(options);
}

function createTray(): void {
  const iconPath = join(__dirname, "../../resources/tray.png");
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip("独去闲工具箱");
  rebuildTrayMenu();
  tray.on("click", () => {
    void windows.showMain();
  });
}

function rebuildTrayMenu(): void {
  if (!tray) {
    return;
  }
  const hotkey = settings.get().hotkey;
  const batteryDevices = batteryStore
    ? Object.values(batteryStore.getDevices()).filter((device) => !device.hidden)
    : [];
  const batteryEnabled = batteryStore?.getSettings().trayEnabled && batteryDevices.length > 0;
  const batteryStatus = (device: (typeof batteryDevices)[number]): string => {
    const name = device.customName || device.product || "外设";
    if (device.online === false) return `${name}：未连接`;
    if (typeof device.lastReading?.capacity === "number") {
      const charging = device.lastReading.charging ? "，充电中" : "";
      return `${name}：${device.lastReading.capacity}%${charging}`;
    }
    return `${name}：等待读数`;
  };
  tray.setToolTip(
    batteryEnabled
      ? ["独去闲工具箱", ...batteryDevices.slice(0, 5).map(batteryStatus)].join("\n")
      : "独去闲工具箱",
  );
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: `截图（${hotkey}）`,
        click: () => void startCapture("region"),
      },
      {
        label: "截取当前显示器",
        click: () => void startCapture("fullscreen"),
      },
      {
        label: "重复上次选区",
        click: () => void startCapture("repeat"),
      },
      ...(batteryEnabled
        ? [
            { type: "separator" as const },
            {
              label: "Battery Hub",
              submenu: [
                ...batteryDevices.map((device) => ({
                  label: batteryStatus(device),
                  click: () => void windows.showMain("battery"),
                })),
                { type: "separator" as const },
                {
                  label: "打开 Battery Hub",
                  click: () => void windows.showMain("battery"),
                },
              ],
            },
          ]
        : []),
      { type: "separator" },
      {
        label: "设置",
        click: () => {
          void windows.showMain("settings");
          rebuildTrayMenu();
        },
      },
      {
        label: "打开主窗口",
        click: () => void windows.showMain(),
      },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          quitting = true;
          windows.prepareToQuit();
          app.quit();
        },
      },
    ]),
  );
}

app.on("will-quit", () => {
  if (!quitting) {
    return;
  }
  globalShortcut.unregisterAll();
  void capture?.dispose();
  void batteryManager?.stop();
  tray?.destroy();
});

