import type { ComponentType } from "react";
import type { PluginRendererModule } from "./types";

function pluginIdFromPath(path: string): string {
  const match = path.match(/plugins\/([^/]+)\//);
  return match?.[1] ?? "";
}

const loaders = import.meta.glob<{ default: PluginRendererModule }>(
  "../../../plugins/*/renderer/index.tsx",
);

export const plugins: PluginRendererModule[] = [];
export const pluginLoadErrors = new Map<string, string>();
export const pluginViews: Record<
  string,
  ComponentType<{ params: URLSearchParams }>
> = {};

let loading: Promise<void> | null = null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function loadPluginModules(): Promise<void> {
  if (loading) {
    return loading;
  }
  loading = (async () => {
    const results = await Promise.all(
      Object.entries(loaders).map(async ([path, load]) => {
        const id = pluginIdFromPath(path);
        try {
          const loaded = await load();
          if (!loaded.default || loaded.default.id !== id) {
            throw new Error("渲染入口无默认导出，或 ID 与目录名不一致");
          }
          return loaded.default;
        } catch (error) {
          pluginLoadErrors.set(id, errorMessage(error));
          console.error(`插件 ${id} 渲染入口加载失败`, error);
          return null;
        }
      }),
    );

    for (const module of results) {
      if (!module) {
        continue;
      }
      plugins.push(module);
      for (const [view, Component] of Object.entries(module.views ?? {})) {
        pluginViews[`${module.id}:${view}`] = Component;
      }
    }
    plugins.sort((a, b) => a.id.localeCompare(b.id));
  })();
  return loading;
}
