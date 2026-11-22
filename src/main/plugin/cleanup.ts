import { readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import type { Logger } from "../logger";

/**
 * 删除已从构建中发现列表中消失的插件数据。
 * Dirent.isDirectory() 对符号链接返回 false，因此不会跟随链接删除外部目录。
 */
export async function removeOrphanPluginData(
  pluginsRoot: string,
  knownIds: ReadonlySet<string>,
  logger: Logger | null = null,
): Promise<void> {
  const root = resolve(pluginsRoot);
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || knownIds.has(entry.name)) {
      continue;
    }
    const target = resolve(join(root, entry.name));
    if (!target.startsWith(`${root}${sep}`)) {
      continue;
    }
    try {
      await rm(target, { recursive: true, force: true });
    } catch (error) {
      logger?.error("插件遗留数据清理失败", {
        pluginId: entry.name,
        error,
      });
      console.error(`插件 ${entry.name} 的遗留数据清理失败`, error);
    }
  }
}
