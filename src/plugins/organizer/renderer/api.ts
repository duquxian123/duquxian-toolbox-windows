import type { OrganizerApi } from "../shared/api";
import type { OrganizerDirectoryKind } from "../shared/types";

const invoke = <T>(channel: string, payload?: unknown): Promise<T> =>
  window.toolbox.invokePlugin<T>("organizer", channel, payload);

export const organizerApi: OrganizerApi = {
  chooseDirectory: (kind: OrganizerDirectoryKind) =>
    invoke("choose-directory", { kind }),
  scan: (sourceDir: string, outputDir: string) =>
    invoke("scan", { sourceDir, outputDir }),
  execute: (sourceDir: string, outputDir: string) =>
    invoke("execute", { sourceDir, outputDir }),
  getState: () => invoke("get-state"),
};
