import {
  clipboard,
  ClipboardItem,
  desktopCapturer,
  nativeImage,
  screen,
} from "electron";
import type { BrowserWindow } from "electron";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  atomicJsonWrite,
  ensureDirectory,
  readJson,
} from "../../../main/fs-utils";
import type { Logger } from "../../../main/logger";
import type { PluginWindowSpec } from "../../../main/plugin/types";
import type { PluginMediaSource } from "../../../main/plugin/types";
import { nextAvailableFilename } from "../shared/filename";
import {
  containsPoint,
  intersectRects,
  localizeRect,
  unionRects,
} from "../shared/geometry";
import type {
  CaptureMode,
  CaptureSession,
  CaptureSettings,
  CommitRequest,
  CommitResult,
  DisplaySnapshot,
  PinInfo,
  Rectangle,
  WindowTarget,
} from "../shared/types";
import { NativeWindows } from "./native-windows";

interface LastSelectionState {
  displayId: string;
  selection: Rectangle;
}

interface SessionRecord {
  session: CaptureSession;
  directory: string;
  closing: boolean;
}

export interface CaptureWindowHost {
  getMain(): BrowserWindow | null;
  create(spec: PluginWindowSpec): Promise<BrowserWindow>;
  close(window: BrowserWindow): void;
}

export interface CaptureSettingsProvider {
  get(): CaptureSettings;
}

export class CaptureService {
  private readonly sessions = new Map<string, SessionRecord>();
  private readonly nativeWindows = new NativeWindows();
  private readonly statePath: string;
  private overlay: BrowserWindow | null = null;
  private activeSessionId: string | null = null;

  constructor(
    private readonly windows: CaptureWindowHost,
    private readonly settings: CaptureSettingsProvider,
    private readonly userDataPath: string,
    private readonly pinsRoot: string,
    private readonly onPin: (pin: PinInfo) => Promise<PinInfo>,
    private readonly sessionMedia: PluginMediaSource,
    private readonly pinMedia: PluginMediaSource,
    private readonly logger: Logger,
  ) {
    this.statePath = join(userDataPath, "capture-state.json");
  }

  async initialize(): Promise<void> {
    const sessionsRoot = join(this.userDataPath, "sessions");
    await ensureDirectory(sessionsRoot);
    await rm(this.pinsRoot, { recursive: true, force: true });
    await ensureDirectory(this.pinsRoot);
    const entries = await readdir(sessionsRoot, { withFileTypes: true });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const path = join(sessionsRoot, entry.name);
          try {
            const info = await stat(path);
            if (info.mtimeMs < cutoff) {
              await rm(path, { recursive: true, force: true });
            }
          } catch {
            // A concurrent cleanup or manual deletion is harmless here.
          }
        }),
    );
  }

  currentSessionId(): string | null {
    return this.activeSessionId;
  }

  async start(mode: CaptureMode): Promise<void> {
    if (this.sessions.size > 0) {
      throw new Error("已有截图正在进行");
    }

    const sessionId = randomUUID();
    const sessionDirectory = join(this.userDataPath, "sessions", sessionId);
    await ensureDirectory(sessionDirectory);
    this.logger.info("开始截图", { mode, sessionId });

    try {
      const displays = screen.getAllDisplays();
      if (displays.length === 0) {
        throw new Error("未找到可截图的显示器");
      }
      const virtualBounds = unionRects(displays.map((display) => display.bounds));
      const capturedDisplays: DisplaySnapshot[] = [];

      for (const [index, display] of displays.entries()) {
        const pixelWidth = Math.max(
          1,
          Math.round(display.bounds.width * display.scaleFactor),
        );
        const pixelHeight = Math.max(
          1,
          Math.round(display.bounds.height * display.scaleFactor),
        );
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width: pixelWidth, height: pixelHeight },
        });
        const source =
          sources.find(
            (candidate) => String(candidate.display_id) === String(display.id),
          ) ?? sources[index];
        if (!source || source.thumbnail.isEmpty()) {
          throw new Error(`无法捕获显示器 ${index + 1}`);
        }

        const image = source.thumbnail;
        const imageSize = image.getSize();
        const imagePath = join(sessionDirectory, `display-${index}.png`);
        await writeFile(imagePath, image.toPNG());
        capturedDisplays.push({
          id: String(display.id),
          label: display.label || `显示器 ${index + 1}`,
          globalBounds: { ...display.bounds },
          localBounds: localizeRect(display.bounds, virtualBounds),
          scaleFactor: display.scaleFactor,
          pixelWidth: imageSize.width,
          pixelHeight: imageSize.height,
          imageUrl: this.sessionMedia.url(
            sessionId,
            `display-${index}.png`,
          ),
        });
      }

      const windows = this.readWindows(virtualBounds);
      const mainTitle = this.windows.getMain()?.getTitle();
      this.logger.info("截图窗口候选已生成", {
        windowCount: windows.length,
        ownWindowIncluded: mainTitle
          ? windows.some((window) => window.title === mainTitle)
          : false,
      });
      const cursorPoint = screen.getCursorScreenPoint();
      const cursorVisible = this.nativeWindows.cursorVisible();
      const settings = this.settings.get();
      const initialSelection =
        mode === "repeat"
          ? await this.repeatSelectionForDisplays(capturedDisplays, virtualBounds)
          : this.initialSelectionForMode(
              mode,
              capturedDisplays,
              cursorPoint,
              virtualBounds,
            );
      const session: CaptureSession = {
        id: sessionId,
        createdAt: new Date().toISOString(),
        mode,
        virtualBounds,
        displays: capturedDisplays,
        windows,
        cursor: {
          x: cursorPoint.x - virtualBounds.x,
          y: cursorPoint.y - virtualBounds.y,
          visible: cursorVisible,
        },
        initialSelection,
        autoCopy: settings.autoCopy && initialSelection === null,
        captureCursor: settings.captureCursor,
        primaryScaleFactor: screen.getPrimaryDisplay().scaleFactor,
      };

      const record: SessionRecord = {
        session,
        directory: sessionDirectory,
        closing: false,
      };
      this.sessions.set(sessionId, record);
      this.activeSessionId = sessionId;

      const overlay = await this.windows.create({
        role: "overlay",
        view: "capture",
        params: {
          sessionId,
          initialSelection: initialSelection ? "1" : "0",
        },
        bounds: virtualBounds,
        options: {
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
        },
        onClosed: () => {
          this.overlay = null;
          const active = this.sessions.get(sessionId);
          if (active && !active.closing) {
            void this.cancel(sessionId);
          }
        },
      });
      this.overlay = overlay;
      if (!overlay.isDestroyed()) {
        overlay.show();
        overlay.setBounds({
          x: Math.round(virtualBounds.x),
          y: Math.round(virtualBounds.y),
          width: Math.round(virtualBounds.width),
          height: Math.round(virtualBounds.height),
        });
        overlay.setAlwaysOnTop(true, "screen-saver");
        overlay.focus();
      }
    } catch (error) {
      await rm(sessionDirectory, { recursive: true, force: true });
      this.logger.error("截图启动失败", { mode, sessionId, error });
      throw error;
    }
  }

  getSession(sessionId: string): CaptureSession {
    const record = this.sessions.get(sessionId);
    if (!record) {
      throw new Error("截图会话不存在或已结束");
    }
    return structuredClone(record.session);
  }

  async commit(request: CommitRequest): Promise<CommitResult> {
    const record = this.sessions.get(request.sessionId);
    if (!record) {
      throw new Error("截图会话不存在或已结束");
    }
    validateCommitRequest(request);

    const finalBuffer = Buffer.from(request.finalImage);
    const originalBuffer = Buffer.from(request.originalImage);
    const finalImage = nativeImage.createFromBuffer(finalBuffer);
    if (finalImage.isEmpty()) {
      throw new Error("截图内容无效");
    }

    const createdAt = new Date();
    const settings = this.settings.get();
    this.logger.info("提交截图", {
      sessionId: request.sessionId,
      operation: request.operation,
      width: request.width,
      height: request.height,
    });
    let savedPath: string | undefined;
    let pinId: string | undefined;
    let pinDirectory: string | undefined;
    if (request.operation === "save") {
      savedPath = await this.reserveSavePath(settings, createdAt);
    }

    try {
      if (request.operation === "copy") {
        await clipboard.write([
          new ClipboardItem({
            "image/png": new Blob([finalBuffer], { type: "image/png" }),
          }),
        ]);
      } else if (request.operation === "copy-original") {
        if (nativeImage.createFromBuffer(originalBuffer).isEmpty()) {
          throw new Error("原始截图内容无效");
        }
        await clipboard.write([
          new ClipboardItem({
            "image/png": new Blob([originalBuffer], { type: "image/png" }),
          }),
        ]);
      } else if (request.operation === "save") {
        await ensureDirectory(settings.saveDirectory);
        if (!savedPath) {
          throw new Error("无法生成保存路径");
        }
        await writeFile(savedPath, finalBuffer);
      } else if (request.operation === "pin") {
        const nextPinId = randomUUID();
        pinDirectory = join(this.pinsRoot, nextPinId);
        await ensureDirectory(pinDirectory);
        const imagePath = join(pinDirectory, "final.png");
        await writeFile(imagePath, finalBuffer);
        const pin = await this.onPin({
          id: nextPinId,
          imagePath,
          imageUrl: this.pinMedia.url(nextPinId, "final.png"),
          width: request.width,
          height: request.height,
        });
        pinId = pin.id;
      }
    } catch (error) {
      if (pinDirectory) {
        await rm(pinDirectory, { recursive: true, force: true });
      }
      if (savedPath && existsSync(savedPath)) {
        await rm(savedPath, { force: true });
      }
      this.logger.error("截图处理失败", {
        sessionId: request.sessionId,
        operation: request.operation,
        error,
      });
      throw error;
    }

    await this.rememberSelection(record.session, request.selection);
    await this.finishSession(request.sessionId);
    this.logger.info("截图处理完成", {
      sessionId: request.sessionId,
      operation: request.operation,
      saved: Boolean(savedPath),
      pinned: Boolean(pinId),
    });
    return {
      operation: request.operation,
      savedPath,
      pinId,
    };
  }

  async cancel(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }
    this.logger.info("取消截图", { sessionId });
    record.closing = true;
    this.closeOverlay();
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    await rm(record.directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }

  async dispose(): Promise<void> {
    const sessionIds = [...this.sessions.keys()];
    await Promise.all(sessionIds.map((sessionId) => this.cancel(sessionId)));
    this.overlay = null;
    this.activeSessionId = null;
  }

  private closeOverlay(): void {
    if (this.overlay) {
      this.windows.close(this.overlay);
      this.overlay = null;
    }
  }

  private readWindows(virtualBounds: Rectangle): WindowTarget[] {
    return this.nativeWindows
      .listTopLevelWindows({ includeCurrentProcess: true })
      .filter((window) => intersectRects(window.globalBounds, virtualBounds))
      .map((window) => ({
        ...window,
        localBounds: localizeRect(window.globalBounds, virtualBounds),
      }));
  }

  private initialSelectionForMode(
    mode: CaptureMode,
    displays: DisplaySnapshot[],
    cursorPoint: { x: number; y: number },
    virtualBounds: Rectangle,
  ): Rectangle | null {
    if (mode === "fullscreen") {
      const cursorDisplay = screen.getDisplayNearestPoint(cursorPoint);
      const captured = displays.find(
        (display) => display.id === String(cursorDisplay.id),
      );
      return captured
        ? { ...captured.localBounds }
        : localizeRect(cursorDisplay.bounds, virtualBounds);
    }
    return null;
  }

  private async repeatSelectionForDisplays(
    displays: DisplaySnapshot[],
    virtualBounds: Rectangle,
  ): Promise<Rectangle | null> {
    const state = await this.readLastSelection();
    if (!state) {
      return null;
    }
    const display = displays.find((candidate) => candidate.id === state.displayId);
    if (!display) {
      return null;
    }
    const selection = {
      x: display.globalBounds.x + state.selection.x,
      y: display.globalBounds.y + state.selection.y,
      width: state.selection.width,
      height: state.selection.height,
    };
    const clamped = intersectRects(selection, display.globalBounds);
    return clamped ? localizeRect(clamped, virtualBounds) : null;
  }

  async startRepeat(): Promise<void> {
    await this.start("repeat");
  }

  private async rememberSelection(
    session: CaptureSession,
    selection: Rectangle,
  ): Promise<void> {
    const globalSelection = {
      x: session.virtualBounds.x + selection.x,
      y: session.virtualBounds.y + selection.y,
      width: selection.width,
      height: selection.height,
    };
    const center = {
      x: globalSelection.x + globalSelection.width / 2,
      y: globalSelection.y + globalSelection.height / 2,
    };
    const display =
      session.displays.find((candidate) =>
        containsPoint(candidate.globalBounds, center),
      ) ?? session.displays[0];
    if (!display) {
      return;
    }
    const state: LastSelectionState = {
      displayId: display.id,
      selection: {
        x: globalSelection.x - display.globalBounds.x,
        y: globalSelection.y - display.globalBounds.y,
        width: globalSelection.width,
        height: globalSelection.height,
      },
    };
    await atomicJsonWrite(this.statePath, state);
  }

  private async readLastSelection(): Promise<LastSelectionState | null> {
    try {
      const state = await readJson<LastSelectionState>(this.statePath);
      return state &&
        typeof state.displayId === "string" &&
        state.selection &&
        state.selection.width > 0 &&
        state.selection.height > 0
        ? state
        : null;
    } catch {
      return null;
    }
  }

  private async reserveSavePath(
    settings: CaptureSettings,
    createdAt: Date,
  ): Promise<string> {
    await mkdir(settings.saveDirectory, { recursive: true });
    const pad = (value: number) => String(value).padStart(2, "0");
    const baseName = `${createdAt.getFullYear()}-${pad(
      createdAt.getMonth() + 1,
    )}-${pad(createdAt.getDate())}_${pad(createdAt.getHours())}-${pad(
      createdAt.getMinutes(),
    )}-${pad(createdAt.getSeconds())}`;
    return nextAvailableFilename(
      settings.saveDirectory,
      baseName,
      ".png",
      existsSync,
    );
  }

  private async finishSession(sessionId: string): Promise<void> {
    const record = this.sessions.get(sessionId);
    if (!record) {
      return;
    }
    record.closing = true;
    this.closeOverlay();
    this.sessions.delete(sessionId);
    if (this.activeSessionId === sessionId) {
      this.activeSessionId = null;
    }
    await rm(record.directory, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

function validateCommitRequest(request: CommitRequest): void {
  if (
    !request.selection ||
    request.selection.width <= 0 ||
    request.selection.height <= 0
  ) {
    throw new Error("截图选区无效");
  }
  if (
    !Number.isFinite(request.width) ||
    !Number.isFinite(request.height) ||
    request.width <= 0 ||
    request.height <= 0 ||
    request.width > 20_000 ||
    request.height > 20_000
  ) {
    throw new Error("截图尺寸超出允许范围");
  }
  if (
    request.finalImage.byteLength === 0 ||
    request.originalImage.byteLength === 0 ||
    request.finalImage.byteLength > 100 * 1024 * 1024 ||
    request.originalImage.byteLength > 100 * 1024 * 1024
  ) {
    throw new Error("截图数据为空或过大");
  }
}
