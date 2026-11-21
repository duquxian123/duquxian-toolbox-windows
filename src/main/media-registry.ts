import { resolve } from "node:path";
import type { PluginMediaSource } from "./plugin/types";
import { pluginMediaSource } from "./plugin/namespace";

/** 可注册的 toolbox://media 源，插件删除后命名空间自然消失。 */
export class MediaRegistry {
  private readonly sources = new Map<string, string>();

  registerSource(
    pluginId: string,
    name: string,
    root: string,
  ): PluginMediaSource {
    if (!name || name.includes("/") || name.includes(":")) {
      throw new Error("媒体源名称无效");
    }
    const source = pluginMediaSource(pluginId, name);
    if (this.sources.has(source)) {
      throw new Error(`媒体源 ${source} 已存在`);
    }
    this.sources.set(source, resolve(root));
    return {
      url: (recordId: string, fileName: string) => {
        if (!recordId || recordId.includes("/") || recordId.includes(":")) {
          throw new Error("媒体记录 ID 无效");
        }
        if (!fileName || fileName.includes("/") || fileName.includes(":")) {
          throw new Error("媒体文件名无效");
        }
        return `toolbox://media/${encodeURIComponent(source)}/${encodeURIComponent(
          recordId,
        )}/${encodeURIComponent(fileName)}`;
      },
      dispose: () => {
        this.sources.delete(source);
      },
    };
  }

  get(name: string): string | null {
    return this.sources.get(name) ?? null;
  }
}
