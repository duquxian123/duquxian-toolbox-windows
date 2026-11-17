import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  CaptureMode,
  CommitRequest,
  PinInfo,
  SettingsUpdateResult,
  ToolboxApi,
} from "../shared/types";

const api: ToolboxApi = {
  getBootstrap: () => ipcRenderer.invoke("toolbox:get-bootstrap"),
  startCapture: (mode: CaptureMode) => ipcRenderer.invoke("capture:start", mode),
  getCaptureSession: (sessionId: string) =>
    ipcRenderer.invoke("capture:get-session", sessionId),
  commitCapture: (request: CommitRequest) =>
    ipcRenderer.invoke("capture:commit", request),
  cancelCapture: (sessionId: string) =>
    ipcRenderer.invoke("capture:cancel", sessionId),
  getPin: (pinId: string): Promise<PinInfo> =>
    ipcRenderer.invoke("pin:get", pinId),
  copyPin: (pinId: string) => ipcRenderer.invoke("pin:copy", pinId),
  closePin: (pinId: string) => ipcRenderer.invoke("pin:close", pinId),
  updateSettings: (patch: Partial<AppSettings>): Promise<SettingsUpdateResult> =>
    ipcRenderer.invoke("settings:update", patch),
  chooseSaveDirectory: () => ipcRenderer.invoke("settings:choose-directory"),
  showMainWindow: (section?: string) =>
    ipcRenderer.invoke("app:show-main", section),
  quit: () => ipcRenderer.invoke("app:quit"),
  onHotkeyError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => {
      callback(message);
    };
    ipcRenderer.on("toolbox:hotkey-error", listener);
    return () => ipcRenderer.removeListener("toolbox:hotkey-error", listener);
  },
  onNavigate: (callback: (section: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, section: string) => {
      callback(section);
    };
    ipcRenderer.on("toolbox:navigate", listener);
    return () => ipcRenderer.removeListener("toolbox:navigate", listener);
  },
};

contextBridge.exposeInMainWorld("toolbox", api);

