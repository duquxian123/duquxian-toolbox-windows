import { app, dialog } from "electron";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { CoreSettings, LogLevel } from "../shared/types";
import { errorMessage } from "./fs-utils";
import { HotkeyService } from "./hotkey-service";
import { IpcBus } from "./ipc-bus";
import {
  createLogger,
  readLogSnapshot,
  type Logger,
} from "./logger";
import { MediaRegistry } from "./media-registry";
import { removeOrphanPluginData } from "./plugin/cleanup";
import {
  pluginChannel,
  pluginRole,
  pluginView,
} from "./plugin/namespace";
import { PluginHotkeyScope } from "./plugin/hotkey-scope";
import { PluginRegistry } from "./plugin/registry";
import type {
  PluginContext,
  PluginContextHandle,
  PluginMediaSource,
} from "./plugin/types";
import { installToolboxProtocol, registerToolboxScheme } from "./protocol";
import { SettingsService } from "./settings-service";
import { TrayService } from "./tray-service";
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
let ipcBus: IpcBus;
let tray: TrayService;
let hotkeys: HotkeyService;
let registry: PluginRegistry;
let logger: Logger | null = null;
let quitting = false;

app.on("second-instance", () => {
  logger?.info("检测到第二实例，显示主窗口");
  void windows?.showMain();
});

app.on("window-all-closed", () => {
  // The tray keeps the application alive.
});

app.on("activate", () => {
  logger?.info("应用被重新激活");
  void windows?.showMain();
});

app.on("before-quit", () => {
  logger?.info("应用准备退出");
  quitting = true;
  windows?.prepareToQuit();
  void registry?.stopAll();
});

app.whenReady().then(initialize).catch((error) => {
  logger?.error("应用启动失败", { error });
  dialog.showErrorBox("独去闲工具箱启动失败", errorMessage(error));
  app.quit();
});

async function initialize(): Promise<void> {
  app.setAppUserModelId("com.duquxian.toolbox.app");
  const userDataPath = app.getPath("userData");
  const appLogger = createLogger(join(userDataPath, "logs"));
  logger = appLogger;
  appLogger.info("应用启动", {
    version: app.getVersion(),
    platform: process.platform,
    arch: process.arch,
    electron: process.versions.electron,
  });
  process.once("uncaughtExceptionMonitor", (error) => {
    logger?.error("主进程未捕获异常", { error });
  });

  settings = await SettingsService.create(appLogger.child("settings"));
  windows = new WindowManager();
  ipcBus = new IpcBus(windows);
  hotkeys = new HotkeyService(appLogger.child("hotkey"));
  tray = new TrayService(windows, quit, appLogger.child("tray"));
  const media = new MediaRegistry();

  installToolboxProtocol({
    rendererRoot: join(__dirname, "../renderer"),
    media,
  });

  registry = new PluginRegistry(
    (meta) =>
      createPluginContext(meta, {
        userDataPath,
        ipcBus,
        windows,
        tray,
        hotkeys,
        media,
        logger: appLogger,
      }),
    appLogger.child("plugins"),
    (plugins) => ipcBus.send("toolbox:plugins-changed", plugins),
  );

  registerCoreIpc();
  await removeOrphanPluginData(
    join(userDataPath, "plugins"),
    registry.knownIds,
    appLogger.child("cleanup"),
  );
  windows.createMainWindow();
  tray.init();
  void registry.initialize().catch((error) => {
    logger?.error("插件初始化失败", { error });
    console.error("插件初始化失败", error);
  });
  applyLoginItem(settings.get().launchAtLogin);
}

function createPluginContext(
  meta: PluginContext["meta"],
  services: {
    userDataPath: string;
    ipcBus: IpcBus;
    windows: WindowManager;
    tray: TrayService;
    hotkeys: HotkeyService;
    media: MediaRegistry;
    logger: Logger;
  },
): PluginContextHandle {
  const userDataDir = join(services.userDataPath, "plugins", meta.id);
  mkdirSync(userDataDir, { recursive: true });
  const disposers: Array<() => void> = [];
  const hotkeyScope = new PluginHotkeyScope(services.hotkeys);
  let disposed = false;

  const addDisposer = (dispose: () => void): void => {
    if (disposed) {
      dispose();
      return;
    }
    disposers.push(dispose);
  };

  const context: PluginContext = {
    id: meta.id,
    meta,
    userDataDir,
    ipc: {
      handle: (channel, handler, options) => {
        const namespacedChannel = pluginChannel(meta.id, channel);
        services.ipcBus.handle(namespacedChannel, handler, {
          roles: options?.roles?.map((role) => pluginRole(meta.id, role)),
        });
        addDisposer(() => services.ipcBus.remove(namespacedChannel));
      },
      send: (channel, payload) =>
        services.ipcBus.send(pluginChannel(meta.id, channel), payload),
    },
    windows: {
      getMain: () => services.windows.mainWindow,
      showMain: (section) => services.windows.showMain(section),
      hideMain: () => services.windows.hideMain(),
      create: (spec) =>
        services.windows.create({
          ...spec,
          role: pluginRole(meta.id, spec.role),
          view: spec.view ? pluginView(meta.id, spec.view) : undefined,
        }),
      close: (window) => services.windows.close(window),
    },
    tray: {
      contribute: (provider) => {
        const remove = services.tray.contribute(provider);
        addDisposer(remove);
        return remove;
      },
      refresh: () => services.tray.refresh(),
    },
    hotkeys: {
      register: (accelerator, handler) =>
        hotkeyScope.register(accelerator, handler),
      probe: (accelerator) => services.hotkeys.probe(accelerator),
      suggest: (accelerator, exclude, limit) =>
        services.hotkeys.suggest(accelerator, exclude, limit),
      unregister: (accelerator) => hotkeyScope.unregister(accelerator),
    },
    media: {
      registerSource: (name, root): PluginMediaSource => {
        const source = services.media.registerSource(meta.id, name, root);
        addDisposer(source.dispose);
        return source;
      },
    },
    settings: {
      getCore: () => settings.get(),
    },
    log: services.logger.child(meta.id),
  };

  return {
    context,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      for (const dispose of disposers.splice(0).reverse()) {
        try {
          dispose();
        } catch (error) {
          console.error(`插件 ${meta.id} 清理失败`, error);
        }
      }
      hotkeyScope.dispose();
    },
  };
}

function registerCoreIpc(): void {
  ipcBus.handle(
    "toolbox:get-logs",
    () => {
      if (!logger) {
        throw new Error("日志系统尚未就绪");
      }
      return readLogSnapshot(logger.filePath);
    },
    { roles: ["main"] },
  );

  ipcBus.handle(
    "toolbox:report-log",
    (payload, event) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("日志参数无效");
      }
      const { level, message, data } = payload as {
        level?: unknown;
        message?: unknown;
        data?: unknown;
      };
      if (
        level !== "info" &&
        level !== "warn" &&
        level !== "error"
      ) {
        throw new Error("日志级别无效");
      }
      if (
        typeof message !== "string" ||
        message.length === 0 ||
        message.length > 4_000
      ) {
        throw new Error("日志消息无效");
      }
      if (data !== undefined) {
        let serialized = "";
        try {
          serialized = JSON.stringify(data) ?? "";
        } catch {
          throw new Error("日志数据无法序列化");
        }
        if (serialized.length > 16_000) {
          throw new Error("日志数据过大");
        }
      }

      const details = {
        rendererRole: windows.roleFor(event.sender),
        ...(data === undefined ? {} : { data }),
      };
      const rendererLog = logger?.child("renderer");
      writeLog(rendererLog, level, message, details);
    },
    { roles: ["*"] },
  );

  ipcBus.handle(
    "toolbox:get-bootstrap",
    () => ({
      settings: settings.get(),
      platform: process.platform,
      version: app.getVersion(),
      plugins: registry.statuses(),
    }),
    { roles: ["main"] },
  );

  ipcBus.handle(
    "settings:update",
    async (payload) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("设置参数无效");
      }
      const patch = payload as Partial<CoreSettings>;
      logger?.info("更新应用设置", { keys: Object.keys(patch) });
      const updated = await settings.update(patch);
      if (Object.prototype.hasOwnProperty.call(patch, "launchAtLogin")) {
        applyLoginItem(updated.launchAtLogin);
      }
      return updated;
    },
    { roles: ["main"] },
  );

  ipcBus.handle(
    "app:show-main",
    async (payload) => {
      const section = typeof payload === "string" ? payload : undefined;
      await windows.showMain(section);
    },
    { roles: ["*"] },
  );

  ipcBus.handle(
    "app:quit",
    () => {
      quit();
    },
    { roles: ["*"] },
  );
}

function quit(): void {
  logger?.info("收到退出请求");
  quitting = true;
  windows.prepareToQuit();
  app.quit();
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

app.on("will-quit", () => {
  logger?.info("应用即将退出");
  if (!quitting) {
    return;
  }
  hotkeys?.unregisterAll();
  tray?.dispose();
  void registry?.stopAll();
});

function writeLog(
  target: Logger | null | undefined,
  level: LogLevel,
  message: string,
  data?: unknown,
): void {
  if (!target) {
    return;
  }
  if (level === "info") {
    target.info(message, data);
  } else if (level === "warn") {
    target.warn(message, data);
  } else {
    target.error(message, data);
  }
}
