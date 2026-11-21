import type {
  BrowserWindow,
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
} from "electron";
import type { CoreSettings, Rectangle } from "../../shared/types";
import type { PluginMeta } from "../../shared/plugin";

export interface TrayContribution {
  tooltipLines?: string[];
  items?: MenuItemConstructorOptions[];
}

export interface PluginWindowSpec {
  /** 插件本地窗口角色，框架会加入插件 ID 前缀。 */
  role: string;
  /** 插件本地独立视图名，框架会加入插件 ID 前缀。 */
  view?: string;
  /** 其他地址栏参数。 */
  params?: Record<string, string>;
  bounds?: Rectangle;
  show?: boolean;
  options?: Electron.BrowserWindowConstructorOptions;
  onClosed?: () => void;
}

export interface PluginIpc {
  handle<T>(
    channel: string,
    handler: (payload: unknown, event: IpcMainInvokeEvent) => T | Promise<T>,
    options?: { roles?: string[] },
  ): void;
  send(channel: string, payload?: unknown): void;
}

export interface PluginWindows {
  getMain(): BrowserWindow | null;
  showMain(section?: string): Promise<void>;
  hideMain(): void;
  create(spec: PluginWindowSpec): Promise<BrowserWindow>;
  close(window: BrowserWindow): void;
}

export interface PluginContext {
  readonly id: string;
  readonly meta: PluginMeta;
  readonly userDataDir: string;
  ipc: PluginIpc;
  windows: PluginWindows;
  tray: {
    contribute(provider: () => TrayContribution | null): () => void;
    refresh(): void;
  };
  hotkeys: {
    register(
      accelerator: string,
      handler: () => void,
    ): { ok: boolean; error?: string };
    probe(accelerator: string): { ok: boolean; error?: string };
    suggest(accelerator: string, exclude?: string[], limit?: number): string[];
    unregister(accelerator: string): void;
  };
  media: {
    registerSource(name: string, root: string): PluginMediaSource;
  };
  settings: {
    getCore(): CoreSettings;
  };
  log: Pick<Console, "info" | "warn" | "error">;
}

export interface PluginMainModule {
  setup(ctx: PluginContext): void | Promise<void>;
  start?(): void | Promise<void>;
  stop?(): void | Promise<void>;
}

export interface PluginMediaSource {
  url(recordId: string, fileName: string): string;
  dispose(): void;
}

export interface PluginContextHandle {
  context: PluginContext;
  dispose(): void;
}
