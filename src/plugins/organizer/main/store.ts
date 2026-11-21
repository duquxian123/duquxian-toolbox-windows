import { app } from "electron";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { OrganizerState } from "../shared/types";
import { atomicJsonWrite, readJson } from "../../../main/fs-utils";

interface OrganizerStoreData extends OrganizerState {
  version: 1;
}

export class OrganizerStore {
  readonly filePath: string;
  private state: OrganizerState = { lastSourceDir: null, lastOutputDir: null };
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(rootDir: string) {
    this.filePath = join(rootDir, "state.json");
  }

  static async create(rootDir: string): Promise<OrganizerStore> {
    const store = new OrganizerStore(rootDir);
    const legacyPath = join(app.getPath("userData"), "organizer.json");
    let existing = await readJson<OrganizerStoreData>(store.filePath);
    const migrated = !existing;
    if (!existing) {
      existing = await readJson<OrganizerStoreData>(legacyPath);
    }
    if (existing) {
      store.state = {
        lastSourceDir:
          typeof existing.lastSourceDir === "string" && existing.lastSourceDir.trim()
            ? existing.lastSourceDir
            : null,
        lastOutputDir:
          typeof existing.lastOutputDir === "string" && existing.lastOutputDir.trim()
            ? existing.lastOutputDir
            : null,
      };
      if (migrated) {
        await atomicJsonWrite(store.filePath, {
          version: 1,
          ...store.state,
        });
        await rm(legacyPath, { force: true });
      }
    }
    return store;
  }

  getState(): OrganizerState {
    return { ...this.state };
  }

  update(patch: Partial<OrganizerState>): OrganizerState {
    this.state = { ...this.state, ...patch };
    this.writeChain = this.writeChain
      .then(() =>
        atomicJsonWrite(this.filePath, { version: 1, ...this.state }),
      )
      .catch((error) => {
        console.error("媒体整理设置保存失败", error);
      });
    return this.getState();
  }
}
