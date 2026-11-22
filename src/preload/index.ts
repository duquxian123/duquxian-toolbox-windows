import { contextBridge, ipcRenderer } from "electron";
import type {
  AppBootstrap,
  CoreSettings,
  CoreToolboxApi,
} from "../shared/types";
import type { PluginRuntimeInfo } from "../shared/plugin";

function assertPluginPart(value: string, label: string): string {
  if (!value || value.includes(":")) {
    throw new Error(`${label}无效`);
  }
  return value;
}

function pluginChannel(pluginId: string, channel: string): string {
  return `plugin:${assertPluginPart(pluginId, "插件 ID")}:${assertPluginPart(
    channel,
    "插件通道",
  )}`;
}

const api: CoreToolboxApi = {
  getBootstrap: (): Promise<AppBootstrap> =>
    ipcRenderer.invoke("toolbox:get-bootstrap"),
  updateSettings: (patch: Partial<CoreSettings>): Promise<CoreSettings> =>
    ipcRenderer.invoke("settings:update", patch),
  showMainWindow: (section?: string) =>
    ipcRenderer.invoke("app:show-main", section),
  quit: () => ipcRenderer.invoke("app:quit"),
  getLogs: () => ipcRenderer.invoke("toolbox:get-logs"),
  reportLog: (level, message, data) =>
    ipcRenderer.invoke("toolbox:report-log", { level, message, data }),
  onNavigate: (callback: (section: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, section: string) => {
      callback(section);
    };
    ipcRenderer.on("toolbox:navigate", listener);
    return () => ipcRenderer.removeListener("toolbox:navigate", listener);
  },
  invokePlugin: <T>(
    pluginId: string,
    channel: string,
    payload?: unknown,
  ) =>
    ipcRenderer.invoke(
      pluginChannel(pluginId, channel),
      payload,
    ) as Promise<T>,
  onPluginEvent: <T>(
    pluginId: string,
    event: string,
    callback: (payload: T) => void,
  ) => {
    const channel = pluginChannel(pluginId, event);
    const listener = (_event: Electron.IpcRendererEvent, payload: T) => {
      callback(payload);
    };
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onPluginStatusChanged: (
    callback: (plugins: PluginRuntimeInfo[]) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      plugins: PluginRuntimeInfo[],
    ) => {
      callback(plugins);
    };
    ipcRenderer.on("toolbox:plugins-changed", listener);
    return () =>
      ipcRenderer.removeListener("toolbox:plugins-changed", listener);
  },
};

contextBridge.exposeInMainWorld("toolbox", api);
