import { app, dialog, Notification } from "electron";
import { join } from "node:path";
import { moveDirectoryIfMissing } from "../../../main/fs-utils";
import type { PluginContext, PluginMainModule } from "../../../main/plugin/types";
import { CaptureService } from "./capture-service";
import { PinManager } from "./pins";
import { CaptureSettingsStore } from "./settings";
import { isValidHotkey, normalizeHotkey } from "../shared/settings";
import type {
  CaptureHotkeyResult,
  CaptureMode,
  CaptureSettings,
  CommitRequest,
} from "../shared/types";

let service: CaptureService;
let settings: CaptureSettingsStore;
let pins: PinManager;
let hotkeyError: string | null = null;

export default {
  async setup(ctx) {
    const userDataPath = ctx.userDataDir;
    const sessionsRoot = join(userDataPath, "sessions");
    const pinsRoot = join(userDataPath, "pins");
    const legacyRoot = app.getPath("userData");
    await moveDirectoryIfMissing(join(legacyRoot, "sessions"), sessionsRoot);
    await moveDirectoryIfMissing(join(legacyRoot, "pins"), pinsRoot);

    settings = await CaptureSettingsStore.create(userDataPath);
    pins = new PinManager(ctx);
    const sessionMedia = ctx.media.registerSource("sessions", sessionsRoot);
    const pinMedia = ctx.media.registerSource("pins", pinsRoot);
    service = new CaptureService(
      {
        hideMain: () => ctx.windows.hideMain(),
        create: (spec) => ctx.windows.create(spec),
        close: (window) => ctx.windows.close(window),
      },
      settings,
      userDataPath,
      pinsRoot,
      (pin) => pins.create(pin),
      sessionMedia,
      pinMedia,
    );

    const hotkeyResult = ctx.hotkeys.register(settings.get().hotkey, () => {
      void runCapture("region");
    });
    if (!hotkeyResult.ok) {
      hotkeyError = hotkeyResult.error ?? "截图快捷键不可用";
      showHotkeyError(hotkeyError, () => void ctx.windows.showMain("settings"));
    }

    ctx.ipc.handle("start", async (payload) => {
      const mode = (payload as { mode?: CaptureMode }).mode;
      if (!mode || !["region", "repeat", "fullscreen"].includes(mode)) {
        throw new Error("截图模式无效");
      }
      return runCapture(mode);
    });

    ctx.ipc.handle(
      "get-session",
      (payload) => {
        const sessionId = (payload as { sessionId?: unknown }).sessionId;
        if (typeof sessionId !== "string") {
          throw new Error("截图会话参数无效");
        }
        return service.getSession(sessionId);
      },
      { roles: ["overlay"] },
    );

    ctx.ipc.handle(
      "commit",
      async (payload) => {
        const request = payload as CommitRequest;
        if (!request || request.sessionId !== service.currentSessionId()) {
          throw new Error("截图会话不匹配");
        }
        return service.commit(request);
      },
      { roles: ["overlay"] },
    );

    ctx.ipc.handle(
      "cancel",
      async (payload) => {
        const sessionId = (payload as { sessionId?: unknown }).sessionId;
        if (typeof sessionId !== "string") {
          throw new Error("截图会话参数无效");
        }
        await service.cancel(sessionId);
      },
      { roles: ["overlay"] },
    );

    ctx.ipc.handle(
      "get",
      (payload) => pins.get(readPinId(payload)),
      { roles: ["pin"] },
    );
    ctx.ipc.handle(
      "copy",
      async (payload) => pins.copy(readPinId(payload)),
      { roles: ["pin"] },
    );
    ctx.ipc.handle(
      "close",
      (payload) => pins.close(readPinId(payload)),
      { roles: ["pin"] },
    );

    ctx.ipc.handle("get-settings", () => settings.get());
    ctx.ipc.handle("check-hotkey", (payload) => {
      const hotkey = (payload as { hotkey?: unknown })?.hotkey;
      if (typeof hotkey !== "string") {
        throw new Error("快捷键参数无效");
      }
      return checkHotkey(ctx, hotkey);
    });
    ctx.ipc.handle("get-status", () => ({ hotkeyError }));

    ctx.ipc.handle("update-settings", async (payload) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("截图设置参数无效");
      }
      return updateSettings(ctx, payload as Partial<CaptureSettings>);
    });

    ctx.ipc.handle("choose-directory", async () => {
      const owner = ctx.windows.getMain();
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

    ctx.tray.contribute(() => ({
      items: [
        {
          label: `截图（${settings.get().hotkey}）`,
          click: () => void runCapture("region"),
        },
        {
          label: "截取当前显示器",
          click: () => void runCapture("fullscreen"),
        },
        {
          label: "重复上次选区",
          click: () => void runCapture("repeat"),
        },
      ],
    }));
  },

  async start() {
    await service.initialize();
  },

  async stop() {
    pins?.dispose();
    await service?.dispose();
  },
} satisfies PluginMainModule;

async function runCapture(
  mode: CaptureMode,
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (mode === "repeat") {
      await service.startRepeat();
    } else {
      await service.start(mode);
    }
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("截图失败", error);
    if (Notification.isSupported()) {
      new Notification({ title: "截图失败", body: message }).show();
    }
    return { ok: false, error: message };
  }
}

function showHotkeyError(message: string, onOpen: () => void): void {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title: "截图快捷键不可用",
      body: message,
    });
    notification.on("click", onOpen);
    notification.show();
  }
}

function readPinId(payload: unknown): string {
  const pinId = (payload as { pinId?: unknown })?.pinId;
  if (typeof pinId !== "string") {
    throw new Error("贴图参数无效");
  }
  return pinId;
}

async function updateSettings(
  ctx: PluginContext,
  patch: Partial<CaptureSettings>,
) {
  const current = settings.get();
  const accepted: Partial<CaptureSettings> = { ...patch };
  let hotkey: CaptureHotkeyResult = { ok: true, suggestions: [] };

  if (typeof patch.hotkey === "string") {
    delete accepted.hotkey;
    const check = checkHotkey(ctx, patch.hotkey);
    if (!check.ok) {
      hotkey = check;
    } else {
      const candidate = normalizeHotkey(patch.hotkey);
      if (candidate !== current.hotkey) {
        ctx.hotkeys.unregister(current.hotkey);
        const result = ctx.hotkeys.register(candidate, () => {
          void runCapture("region");
        });
        if (result.ok) {
          accepted.hotkey = candidate;
        } else {
          ctx.hotkeys.register(current.hotkey, () => {
            void runCapture("region");
          });
          hotkey = {
            ok: false,
            error: result.error,
            suggestions: ctx.hotkeys.suggest(candidate, [current.hotkey]),
          };
        }
      }
    }
  }

  try {
    const updated = await settings.update(accepted);
    hotkeyError = hotkey.ok ? null : (hotkey.error ?? "截图快捷键不可用");
    ctx.tray.refresh();
    return { settings: updated, hotkey };
  } catch (error) {
    if (accepted.hotkey) {
      ctx.hotkeys.unregister(accepted.hotkey);
      ctx.hotkeys.register(current.hotkey, () => {
        void runCapture("region");
      });
    }
    throw error;
  }
}

function checkHotkey(ctx: PluginContext, value: string): CaptureHotkeyResult {
  const current = settings.get();
  if (!isValidHotkey(value)) {
    return {
      ok: false,
      error: "快捷键格式无效，请至少包含一个 Ctrl、Alt 或 Super 修饰键",
      suggestions: ctx.hotkeys.suggest(current.hotkey, [current.hotkey]),
    };
  }

  const candidate = normalizeHotkey(value);
  if (candidate === current.hotkey) {
    return { ok: true, suggestions: [] };
  }

  const probe = ctx.hotkeys.probe(candidate);
  return probe.ok
    ? { ok: true, suggestions: [] }
    : {
        ok: false,
        error: probe.error,
        suggestions: ctx.hotkeys.suggest(candidate, [current.hotkey]),
      };
}
