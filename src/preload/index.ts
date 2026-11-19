import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  BatteryAddRequest,
  BatteryDevice,
  CaptureMode,
  CommitRequest,
  BatterySettings,
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
  listBatteryCandidates: () => ipcRenderer.invoke("battery:list-candidates"),
  listBatteryDevices: () => ipcRenderer.invoke("battery:list-devices"),
  addBatteryDevice: (request: BatteryAddRequest) =>
    ipcRenderer.invoke("battery:add", request),
  removeBatteryDevice: (id: string) =>
    ipcRenderer.invoke("battery:remove", id),
  renameBatteryDevice: (id: string, name: string) =>
    ipcRenderer.invoke("battery:rename", id, name),
  setBatteryDeviceIcon: (id: string, icon: string | null) =>
    ipcRenderer.invoke("battery:set-icon", id, icon),
  setBatteryDeviceHidden: (id: string, hidden: boolean) =>
    ipcRenderer.invoke("battery:set-hidden", id, hidden),
  setBatteryDeviceAlert: (id: string, threshold: number | null) =>
    ipcRenderer.invoke("battery:set-alert", id, threshold),
  reorderBatteryDevices: (ids: string[]) =>
    ipcRenderer.invoke("battery:reorder", ids),
  pollBatteryDevicesNow: () =>
    ipcRenderer.invoke("battery:poll-now"),
  captureBatteryCalibration: (id: string) =>
    ipcRenderer.invoke("battery:capture", id),
  getBatterySettings: () => ipcRenderer.invoke("battery:get-settings"),
  updateBatterySettings: (patch: Partial<BatterySettings>) =>
    ipcRenderer.invoke("battery:update-settings", patch),
  runBatteryDiagnostics: () => ipcRenderer.invoke("battery:diagnostics"),
  onBatteryUpdate: (callback: (device: BatteryDevice) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, device: BatteryDevice) => {
      callback(device);
    };
    ipcRenderer.on("battery:update", listener);
    return () => ipcRenderer.removeListener("battery:update", listener);
  },
  onBatteryDevicesChanged: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("battery:devices-changed", listener);
    return () => ipcRenderer.removeListener("battery:devices-changed", listener);
  },
};

contextBridge.exposeInMainWorld("toolbox", api);

