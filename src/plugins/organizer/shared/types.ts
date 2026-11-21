export type OrganizerTimeSource = "captured" | "file";

export type OrganizerDirectoryKind = "source" | "output";

export interface OrganizerPlanItem {
  /** 原文件名（含扩展名） */
  fileName: string;
  /** 源文件完整路径 */
  sourcePath: string;
  /** 用于分类的时间（ISO 字符串） */
  takenAt: string;
  /** 时间来源：拍摄时间 / 文件修改时间 */
  timeSource: OrganizerTimeSource;
  /** 年份文件夹名，如 "2024" */
  year: string;
  /** 目标文件名（含扩展名），如 "2024-05-01.jpg" */
  targetName: string;
  /** 目标文件完整路径 */
  targetPath: string;
}

export interface OrganizerPlan {
  sourceDir: string;
  outputDir: string;
  items: OrganizerPlanItem[];
  /** 跳过的非媒体文件数量 */
  skippedNonMedia: number;
}

export interface OrganizerFailure {
  fileName: string;
  error: string;
}

export interface OrganizerExecuteResult {
  moved: number;
  failed: OrganizerFailure[];
  skippedNonMedia: number;
}

export interface OrganizerState {
  lastSourceDir: string | null;
  lastOutputDir: string | null;
}
