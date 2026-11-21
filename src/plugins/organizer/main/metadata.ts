import { open, stat } from "node:fs/promises";
import { extname } from "node:path";

const MP4_EXTENSIONS = new Set([".mp4", ".mov", ".m4v"]);
const MIN_VALID_TIME = new Date(1990, 0, 1).getTime();

export function isSaneTime(time: number): boolean {
  return Number.isFinite(time) && time >= MIN_VALID_TIME && time <= Date.now();
}

/** 解析 mvhd box payload 的 creation_time（1904 年起秒数，UTC）。 */
export function parseMvhdPayload(payload: Buffer): Date | null {
  if (payload.length < 8) {
    return null;
  }
  const version = payload.readUInt8(0);
  let seconds: number;
  try {
    if (version === 0) {
      seconds = payload.readUInt32BE(4);
    } else if (version === 1) {
      if (payload.length < 12) {
        return null;
      }
      seconds = Number(payload.readBigUInt64BE(4));
    } else {
      return null;
    }
  } catch {
    return null;
  }
  const unixMs = (seconds - 2082844800) * 1000;
  if (!Number.isFinite(unixMs)) {
    return null;
  }
  const date = new Date(unixMs);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function readExifCaptureTime(
  filePath: string,
): Promise<Date | null> {
  let handle: import("node:fs/promises").FileHandle | null = null;
  try {
    // 只读文件头部：EXIF 必定位于 JPEG/HEIC/PNG 的前段，
    // 传 buffer 而不是路径可避免 exifr 内部缓存文件句柄
    handle = await open(filePath, "r");
    const { size } = await handle.stat();
    const readLength = Math.min(size, 2 * 1024 * 1024);
    const buffer = Buffer.alloc(readLength);
    await handle.read(buffer, 0, readLength, 0);

    const exifr = (await import("exifr")).default;
    const data = await exifr.parse(buffer, {
      pick: ["DateTimeOriginal", "CreateDate"],
    });
    if (!data || typeof data !== "object") {
      return null;
    }
    const candidate =
      (data as Record<string, unknown>).DateTimeOriginal ??
      (data as Record<string, unknown>).CreateDate;
    if (candidate instanceof Date && !Number.isNaN(candidate.getTime())) {
      return candidate;
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

interface BoxHeader {
  size: number;
  type: string;
  headerSize: number;
}

type FileHandle = import("node:fs/promises").FileHandle;

/** 读取 position 处的 box 头；越界、截断或长度非法时返回 null。 */
async function readBoxHeader(
  handle: FileHandle,
  position: number,
  fileSize: number,
): Promise<BoxHeader | null> {
  if (position + 8 > fileSize) {
    return null;
  }
  const headerBuffer = Buffer.alloc(16);
  const { bytesRead } = await handle.read(headerBuffer, 0, 16, position);
  if (bytesRead < 8) {
    return null;
  }
  let size = headerBuffer.readUInt32BE(0);
  const type = headerBuffer.toString("ascii", 4, 8);
  let headerSize = 8;
  if (size === 1) {
    if (bytesRead < 16) {
      return null;
    }
    size = Number(headerBuffer.readBigUInt64BE(8));
    headerSize = 16;
  } else if (size === 0) {
    size = fileSize - position;
  }
  if (size < headerSize || position + size > fileSize) {
    return null;
  }
  return { size, type, headerSize };
}

/** 流式遍历：moov 无论在文件头部还是尾部，都能只读几百字节拿到 mvhd。 */
async function readVideoCaptureTime(filePath: string): Promise<Date | null> {
  let handle: FileHandle | null = null;
  try {
    handle = await open(filePath, "r");
    const { size: fileSize } = await handle.stat();

    let position = 0;
    while (position + 8 <= fileSize) {
      const header = await readBoxHeader(handle, position, fileSize);
      if (!header) {
        return null;
      }
      if (header.type === "moov") {
        const payloadStart = position + header.headerSize;
        const moovEnd = position + header.size;
        let childPosition = payloadStart;
        while (childPosition + 8 <= moovEnd) {
          const child = await readBoxHeader(handle, childPosition, moovEnd);
          if (!child) {
            return null;
          }
          if (child.type === "mvhd") {
            const payload = Buffer.alloc(Math.min(child.size - child.headerSize, 20));
            await handle.read(
              payload,
              0,
              payload.length,
              childPosition + child.headerSize,
            );
            return parseMvhdPayload(payload);
          }
          childPosition += child.size;
        }
        return null;
      }
      position += header.size;
    }
    return null;
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

export interface CaptureTimeResult {
  takenAt: Date;
  captured: boolean;
}

/** 拍摄时间优先：图片读 EXIF，MP4/MOV 读 mvhd，其余与失败时用文件修改时间。 */
export async function resolveTakenTime(
  filePath: string,
  mtime: Date,
): Promise<CaptureTimeResult> {
  const extension = extname(filePath).toLowerCase();
  let capturedTime: Date | null = null;
  if (MP4_EXTENSIONS.has(extension)) {
    capturedTime = await readVideoCaptureTime(filePath);
  } else {
    capturedTime = await readExifCaptureTime(filePath);
  }
  if (capturedTime && isSaneTime(capturedTime.getTime())) {
    return { takenAt: capturedTime, captured: true };
  }
  return { takenAt: mtime, captured: false };
}

export async function fileMtime(filePath: string): Promise<Date> {
  const info = await stat(filePath);
  return info.mtime;
}
