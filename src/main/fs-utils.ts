import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function moveDirectoryIfMissing(
  source: string,
  destination: string,
): Promise<void> {
  try {
    if (!(await stat(source)).isDirectory()) {
      return;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }

  try {
    await stat(destination);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await ensureDirectory(dirname(destination));
  try {
    await rename(source, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") {
      throw error;
    }
    await cp(source, destination, { recursive: true });
    await rm(source, { recursive: true, force: true });
  }
}

export async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function atomicJsonWrite(path: string, value: unknown): Promise<void> {
  await ensureDirectory(dirname(path));
  const temporaryPath = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}

export function assertPathWithin(root: string, candidate: string): string {
  const resolvedRoot = resolve(root);
  const resolvedCandidate = resolve(candidate);
  const relativePath = relative(resolvedRoot, resolvedCandidate);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    resolve(resolvedRoot, relativePath) !== resolvedCandidate
  ) {
    throw new Error("路径超出允许目录");
  }
  return resolvedCandidate;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

