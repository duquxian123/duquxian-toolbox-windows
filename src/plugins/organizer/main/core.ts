import { copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";
import type {
  OrganizerExecuteResult,
  OrganizerFailure,
  OrganizerPlan,
  OrganizerPlanItem,
} from "../shared/types";
import { resolveTakenTime } from "./metadata";

const IMAGE_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".heif",
  ".webp",
  ".gif",
  ".bmp",
  ".tif",
  ".tiff",
]);
const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".m4v",
  ".avi",
  ".mkv",
  ".mts",
  ".m2ts",
  ".3gp",
  ".wmv",
]);

export function isMediaFile(fileName: string): boolean {
  const extension = extname(fileName).toLowerCase();
  return IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension);
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatDateName(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function assertValidDirectories(sourceDir: string, outputDir: string): void {
  const source = resolve(sourceDir);
  const output = resolve(outputDir);
  if (source === output) {
    throw new Error("源文件夹和输出文件夹不能是同一个");
  }
  if (output.startsWith(`${source}${sep}`)) {
    throw new Error("输出文件夹不能位于源文件夹内部");
  }
}

async function listExistingNames(directory: string): Promise<Set<string>> {
  const names = new Set<string>();
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      names.add(entry.name.toLowerCase());
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // 年份路径不存在（ENOENT）或被普通文件占用（ENOTDIR）时按"无已占用名字"处理，
    // 后者在执行阶段 mkdir 时会按单文件失败收集
    if (code !== "ENOENT" && code !== "ENOTDIR") {
      throw error;
    }
  }
  return names;
}

/** 为同一天的目标名分配不冲突的文件名（-2、-3 递增）。 */
export function allocateTargetName(
  dateName: string,
  extension: string,
  taken: Set<string>,
): string {
  const normalizedExtension = extension.toLowerCase();
  let candidate = `${dateName}${normalizedExtension}`;
  let suffix = 2;
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${dateName}-${suffix}${normalizedExtension}`;
    suffix += 1;
  }
  taken.add(candidate.toLowerCase());
  return candidate;
}

export async function buildPlan(
  sourceDir: string,
  outputDir: string,
): Promise<OrganizerPlan> {
  assertValidDirectories(sourceDir, outputDir);
  const source = resolve(sourceDir);
  const output = resolve(outputDir);

  const entries = await readdir(source, { withFileTypes: true });
  const mediaFiles: string[] = [];
  let skippedNonMedia = 0;
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith(".")) {
      continue;
    }
    if (isMediaFile(entry.name)) {
      mediaFiles.push(entry.name);
    } else {
      skippedNonMedia += 1;
    }
  }

  // 每个年份文件夹的已占用名字：磁盘上已有的 + 本计划已分配的
  const takenByYear = new Map<string, Set<string>>();
  const items: OrganizerPlanItem[] = [];
  for (const fileName of mediaFiles) {
    const sourcePath = join(source, fileName);
    const info = await stat(sourcePath);
    const { takenAt, captured } = await resolveTakenTime(sourcePath, info.mtime);
    const year = String(takenAt.getFullYear());
    let taken = takenByYear.get(year);
    if (!taken) {
      taken = await listExistingNames(join(output, year));
      takenByYear.set(year, taken);
    }
    const targetName = allocateTargetName(
      formatDateName(takenAt),
      extname(fileName),
      taken,
    );
    items.push({
      fileName,
      sourcePath,
      takenAt: takenAt.toISOString(),
      timeSource: captured ? "captured" : "file",
      year,
      targetName,
      targetPath: join(output, year, targetName),
    });
  }

  items.sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.fileName.localeCompare(b.fileName));
  return { sourceDir: source, outputDir: output, items, skippedNonMedia };
}

async function moveFile(sourcePath: string, targetPath: string): Promise<void> {
  try {
    await rename(sourcePath, targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EXDEV") {
      await copyFile(sourcePath, targetPath);
      await unlink(sourcePath);
      return;
    }
    throw error;
  }
}

export async function executePlan(
  sourceDir: string,
  outputDir: string,
): Promise<OrganizerExecuteResult> {
  // 在主进程重新生成计划，不采用渲染进程回传的路径
  const plan = await buildPlan(sourceDir, outputDir);
  const failed: OrganizerFailure[] = [];
  let moved = 0;
  for (const item of plan.items) {
    try {
      await mkdir(join(plan.outputDir, item.year), { recursive: true });
      await moveFile(item.sourcePath, item.targetPath);
      moved += 1;
    } catch (error) {
      failed.push({
        fileName: item.fileName,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { moved, failed, skippedNonMedia: plan.skippedNonMedia };
}
