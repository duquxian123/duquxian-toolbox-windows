import { dialog } from "electron";
import type { PluginMainModule } from "../../../main/plugin/types";
import { buildPlan, executePlan } from "./core";
import { OrganizerStore } from "./store";
import type { OrganizerDirectoryKind } from "../shared/types";

let store: OrganizerStore;

export default {
  async setup(ctx) {
    store = await OrganizerStore.create(ctx.userDataDir);

    ctx.ipc.handle("choose-directory", async (payload) => {
      const kind = (payload as { kind?: OrganizerDirectoryKind }).kind;
      if (kind !== "source" && kind !== "output") {
        throw new Error("文件夹类型无效");
      }
      const state = store.getState();
      const owner = ctx.windows.getMain();
      const options: Electron.OpenDialogOptions = {
        title: kind === "source" ? "选择待整理的文件夹" : "选择输出文件夹",
        defaultPath:
          (kind === "source" ? state.lastSourceDir : state.lastOutputDir) ??
          undefined,
        properties: ["openDirectory", "createDirectory"],
      };
      const result = owner
        ? await dialog.showOpenDialog(owner, options)
        : await dialog.showOpenDialog(options);
      const chosen = result.canceled ? null : result.filePaths[0] ?? null;
      if (chosen) {
        store.update(
          kind === "source" ? { lastSourceDir: chosen } : { lastOutputDir: chosen },
        );
      }
      return chosen;
    });

    ctx.ipc.handle("get-state", () => store.getState());

    ctx.ipc.handle("scan", async (payload) => {
      const { sourceDir, outputDir } = readDirectories(payload);
      return buildPlan(sourceDir, outputDir);
    });

    ctx.ipc.handle("execute", async (payload) => {
      const { sourceDir, outputDir } = readDirectories(payload);
      return executePlan(sourceDir, outputDir);
    });
  },
} satisfies PluginMainModule;

function readDirectories(payload: unknown): {
  sourceDir: string;
  outputDir: string;
} {
  const value = payload as { sourceDir?: unknown; outputDir?: unknown };
  if (
    !value ||
    typeof value.sourceDir !== "string" ||
    !value.sourceDir.trim() ||
    typeof value.outputDir !== "string" ||
    !value.outputDir.trim()
  ) {
    throw new Error("文件夹参数无效");
  }
  return { sourceDir: value.sourceDir, outputDir: value.outputDir };
}
