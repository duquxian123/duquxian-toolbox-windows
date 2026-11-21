import type { BatteryApi } from "../shared/api";
import type {
  BatteryAddRequest,
  BatteryDevice,
  BatterySettings,
} from "../shared/types";

const invoke = <T>(channel: string, payload?: unknown): Promise<T> =>
  window.toolbox.invokePlugin<T>("battery", channel, payload);

export const batteryApi: BatteryApi = {
  listCandidates: () => invoke("list-candidates"),
  listDevices: () => invoke("list-devices"),
  addDevice: (request: BatteryAddRequest) => invoke("add", request),
  removeDevice: (id: string) => invoke("remove", { id }),
  renameDevice: (id: string, name: string) => invoke("rename", { id, name }),
  setDeviceIcon: (id: string, icon: string | null) =>
    invoke("set-icon", { id, icon }),
  setDeviceHidden: (id: string, hidden: boolean) =>
    invoke("set-hidden", { id, hidden }),
  setDeviceAlert: (id: string, threshold: number | null) =>
    invoke("set-alert", { id, threshold }),
  reorderDevices: (ids: string[]) => invoke("reorder", { ids }),
  pollNow: () => invoke("poll-now"),
  captureCalibration: (id: string) => invoke("capture", { id }),
  getSettings: () => invoke("get-settings"),
  updateSettings: (patch: Partial<BatterySettings>) =>
    invoke("update-settings", patch),
  runDiagnostics: () => invoke("diagnostics"),
  onUpdate: (callback: (device: BatteryDevice) => void) =>
    window.toolbox.onPluginEvent("battery", "update", callback),
  onDevicesChanged: (callback: () => void) =>
    window.toolbox.onPluginEvent("battery", "devices-changed", callback),
};
