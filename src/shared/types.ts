import type { PluginRuntimeInfo } from "./plugin";

export type ThemeMode = "system" | "light" | "dark";

/** 框架级设置：与具体插件无关。 */
export interface CoreSettings {
  version: 1;
  theme: ThemeMode;
  launchAtLogin: boolean;
}

export interface AppBootstrap {
  settings: CoreSettings;
  platform: string;
  version: string;
  plugins: PluginRuntimeInfo[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CoreToolboxApi {
  getBootstrap(): Promise<AppBootstrap>;
  updateSettings(patch: Partial<CoreSettings>): Promise<CoreSettings>;
  showMainWindow(section?: string): Promise<void>;
  quit(): Promise<void>;
  onNavigate(callback: (section: string) => void): () => void;
  invokePlugin<T>(
    pluginId: string,
    channel: string,
    payload?: unknown,
  ): Promise<T>;
  onPluginEvent<T>(
    pluginId: string,
    event: string,
    callback: (payload: T) => void,
  ): () => void;
  onPluginStatusChanged(
    callback: (plugins: PluginRuntimeInfo[]) => void,
  ): () => void;
}
