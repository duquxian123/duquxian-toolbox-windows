import type {
  OrganizerDirectoryKind,
  OrganizerExecuteResult,
  OrganizerPlan,
  OrganizerState,
} from "./types";

export interface OrganizerApi {
  chooseDirectory(kind: OrganizerDirectoryKind): Promise<string | null>;
  scan(sourceDir: string, outputDir: string): Promise<OrganizerPlan>;
  execute(sourceDir: string, outputDir: string): Promise<OrganizerExecuteResult>;
  getState(): Promise<OrganizerState>;
}
