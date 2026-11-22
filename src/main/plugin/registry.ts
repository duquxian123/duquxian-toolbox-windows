import type {
  PluginMeta,
  PluginRuntimeInfo,
  PluginRuntimeState,
} from "../../shared/plugin";
import type { Logger } from "../logger";
import type {
  PluginContextHandle,
  PluginMainModule,
} from "./types";

type MetaLoader = () => Promise<{ meta: PluginMeta }>;
type ModuleLoader = () => Promise<{ default: PluginMainModule }>;

interface PluginEntry {
  id: string;
  meta: PluginMeta;
  state: PluginRuntimeState;
  error?: string;
  module?: PluginMainModule;
  handle?: PluginContextHandle;
  disposed: boolean;
}

function pluginIdFromPath(path: string): string {
  const match = path.match(/plugins\/([^/]+)\//);
  return match?.[1] ?? "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fallbackMeta(id: string): PluginMeta {
  return {
    id,
    order: Number.MAX_SAFE_INTEGER,
    navTitle: id,
  };
}

export class PluginRegistry {
  private readonly metaLoaders: Record<string, MetaLoader>;
  private readonly moduleLoaders: Record<string, ModuleLoader>;
  private readonly entries: PluginEntry[];
  private readonly pipelines: Promise<void>[] = [];
  private stopping = false;
  private started = false;

  constructor(
    private readonly createContext: (
      meta: PluginMeta,
    ) => PluginContextHandle,
    private readonly logger: Logger,
    private readonly onStatusChanged: (
      plugins: PluginRuntimeInfo[],
    ) => void = () => {},
  ) {
    this.metaLoaders = import.meta.glob<{ meta: PluginMeta }>(
      "../../plugins/*/plugin.ts",
    );
    this.moduleLoaders = import.meta.glob<{ default: PluginMainModule }>(
      "../../plugins/*/main/index.ts",
    );

    const ids = new Set([
      ...Object.keys(this.metaLoaders).map(pluginIdFromPath),
      ...Object.keys(this.moduleLoaders).map(pluginIdFromPath),
    ]);
    this.entries = [...ids]
      .filter(Boolean)
      .map((id) => ({
        id,
        meta: fallbackMeta(id),
        state: "loading",
        disposed: false,
      }));
  }

  get knownIds(): ReadonlySet<string> {
    return new Set(
      Object.keys(this.metaLoaders).map(pluginIdFromPath).filter(Boolean),
    );
  }

  get ids(): string[] {
    return this.entries.map((entry) => entry.id);
  }

  statuses(): PluginRuntimeInfo[] {
    return [...this.entries]
      .sort(
        (a, b) =>
          a.meta.order - b.meta.order || a.id.localeCompare(b.id),
      )
      .map((entry) => ({
        id: entry.id,
        navTitle: entry.meta.navTitle,
        order: entry.meta.order,
        state: entry.state,
        ...(entry.error ? { error: entry.error } : {}),
      }));
  }

  initialize(): Promise<void> {
    if (this.started) {
      return Promise.allSettled(this.pipelines).then(() => undefined);
    }
    this.started = true;
    this.logger.info("插件初始化开始", { plugins: this.ids });
    this.emitStatus();
    for (const entry of this.entries) {
      this.pipelines.push(this.initializeEntry(entry));
    }
    return Promise.allSettled(this.pipelines).then(() => undefined);
  }

  async stopAll(): Promise<void> {
    if (this.stopping) {
      return;
    }
    this.stopping = true;
    await Promise.allSettled(this.pipelines);
    for (const entry of [...this.entries].reverse()) {
      if (entry.module && entry.state === "ready") {
        try {
          await entry.module.stop?.();
        } catch (error) {
          this.fail(entry, error, false);
        }
      }
      this.disposeEntry(entry);
    }
  }

  private async initializeEntry(entry: PluginEntry): Promise<void> {
    try {
      const metaLoader = this.metaLoaders[
        `../../plugins/${entry.id}/plugin.ts`
      ];
      if (!metaLoader) {
        throw new Error("缺少 plugin.ts");
      }
      const loadedMeta = await metaLoader();
      if (!loadedMeta.meta || loadedMeta.meta.id !== entry.id) {
        throw new Error("插件元信息与目录名不一致");
      }
      entry.meta = loadedMeta.meta;
      this.logger.info("插件元信息已加载", {
        pluginId: entry.id,
        title: entry.meta.navTitle,
      });
      this.emitStatus();
      if (this.stopping) {
        return;
      }

      const moduleLoader = this.moduleLoaders[
        `../../plugins/${entry.id}/main/index.ts`
      ];
      if (!moduleLoader) {
        throw new Error("缺少主进程入口");
      }
      const loadedModule = await moduleLoader();
      if (!loadedModule.default) {
        throw new Error("主进程入口没有默认导出");
      }
      if (this.stopping) {
        return;
      }
      entry.module = loadedModule.default;
      entry.handle = this.createContext(entry.meta);
      await entry.module.setup(entry.handle.context);
      if (this.stopping) {
        this.disposeEntry(entry);
        return;
      }
      await entry.module.start?.();
      entry.state = "ready";
      entry.error = undefined;
      this.logger.info("插件已就绪", { pluginId: entry.id });
    } catch (error) {
      this.fail(entry, error);
    } finally {
      this.emitStatus();
    }
  }

  private fail(
    entry: PluginEntry,
    error: unknown,
    report = true,
  ): void {
    const message = errorMessage(error);
    entry.state = "failed";
    entry.error = message;
    this.disposeEntry(entry);
    if (report) {
      this.logger.error("插件执行失败", {
        pluginId: entry.id,
        error,
      });
      console.error(`插件 ${entry.id} 执行失败：${message}`);
    } else {
      this.logger.warn("插件停止失败", {
        pluginId: entry.id,
        error,
      });
    }
  }

  private disposeEntry(entry: PluginEntry): void {
    if (entry.disposed) {
      return;
    }
    entry.disposed = true;
    try {
      entry.handle?.dispose();
    } catch (error) {
      this.logger.error("插件清理失败", {
        pluginId: entry.id,
        error,
      });
      console.error(`插件 ${entry.id} 清理失败`, error);
    }
  }

  private emitStatus(): void {
    this.onStatusChanged(this.statuses());
  }
}
