import { mkdtemp, mkdir, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allocateTargetName,
  buildPlan,
  executePlan,
  formatDateName,
  isMediaFile,
} from "../main/core";
import { isSaneTime, parseMvhdPayload, resolveTakenTime } from "../main/metadata";

function box(type: string, payload: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(8 + payload.length, 0);
  return Buffer.concat([size, Buffer.from(type, "ascii"), payload]);
}

function mvhdPayload(version: 0 | 1, seconds: number): Buffer {
  const payload = Buffer.alloc(version === 0 ? 100 : 112);
  payload.writeUInt8(version, 0);
  if (version === 0) {
    payload.writeUInt32BE(seconds, 4);
  } else {
    payload.writeBigUInt64BE(BigInt(seconds), 4);
  }
  return payload;
}

function mvhdBox(version: 0 | 1, seconds: number): Buffer {
  return box("mvhd", mvhdPayload(version, seconds));
}

function sampleMp4(seconds: number, version: 0 | 1 = 0): Buffer {
  return Buffer.concat([
    box("ftyp", Buffer.from([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1, 0x69, 0x73, 0x6f, 0x6d])),
    box("moov", mvhdBox(version, seconds)),
  ]);
}

/** moov 在文件末尾（手机录像的典型布局），mdat 内容里掺入伪 box 头字节。 */
function sampleMp4MoovAtEnd(seconds: number, mdatSize = 4096): Buffer {
  const mdatPayload = Buffer.alloc(mdatSize);
  // 伪造成 moov/mvhd 样式的字节，验证遍历器不会进入 mdat 数据区误判
  mdatPayload.writeUInt32BE(16, 0);
  mdatPayload.write("moov", 4, "ascii");
  mdatPayload.writeUInt32BE(16, 8);
  mdatPayload.write("mvhd", 12, "ascii");
  return Buffer.concat([
    box("ftyp", Buffer.from([0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 1, 0x69, 0x73, 0x6f, 0x6d])),
    box("mdat", mdatPayload),
    box("moov", mvhdBox(0, seconds)),
  ]);
}

const UNIX_2023_03_15 = 1678857600; // 2023-03-15T08:00:00Z
const MVHD_EPOCH_OFFSET = 2082844800;

/** 构造带 DateTimeOriginal 的最小 EXIF JPEG（II 小端 TIFF，ExifIFD 单条目）。 */
function sampleExifJpeg(dateTime: string): Buffer {
  const text = Buffer.from(`${dateTime}\0`, "ascii"); // 20 字节
  const tiff = Buffer.alloc(44 + text.length);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4); // IFD0 偏移
  tiff.writeUInt16LE(1, 8); // IFD0 条目数
  tiff.writeUInt16LE(0x8769, 10); // ExifIFD 指针
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18); // ExifIFD 偏移
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26); // ExifIFD 条目数
  tiff.writeUInt16LE(0x9003, 28); // DateTimeOriginal
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(text.length, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.writeUInt32LE(0, 40);
  text.copy(tiff, 44);

  const app1Payload = Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0);
  header.writeUInt16BE(2 + app1Payload.length, 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    header,
    app1Payload,
    Buffer.from([0xff, 0xd9]),
  ]);
}

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "organizer-test-"));
});

afterEach(async () => {
  await rm(workDir, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
});

async function makeFile(path: string, content: string | Buffer, mtime?: Date): Promise<void> {
  await writeFile(path, content);
  if (mtime) {
    await utimes(path, mtime, mtime);
  }
}

describe("media type detection", () => {
  it("recognizes image and video extensions case-insensitively", () => {
    expect(isMediaFile("IMG_0001.JPG")).toBe(true);
    expect(isMediaFile("video.Mp4")).toBe(true);
    expect(isMediaFile("clip.mov")).toBe(true);
    expect(isMediaFile("photo.heic")).toBe(true);
    expect(isMediaFile("notes.txt")).toBe(false);
    expect(isMediaFile("archive.zip")).toBe(false);
    expect(isMediaFile("no-extension")).toBe(false);
  });
});

describe("formatDateName", () => {
  it("formats as YYYY-MM-DD with zero padding", () => {
    expect(formatDateName(new Date(2024, 0, 5))).toBe("2024-01-05");
    expect(formatDateName(new Date(2023, 11, 31))).toBe("2023-12-31");
  });
});

describe("allocateTargetName", () => {
  it("returns the plain name when free", () => {
    expect(allocateTargetName("2024-05-01", ".JPG", new Set())).toBe("2024-05-01.jpg");
  });

  it("appends -2, -3 against taken names case-insensitively and records them", () => {
    const taken = new Set(["2024-05-01.jpg"]);
    expect(allocateTargetName("2024-05-01", ".jpg", taken)).toBe("2024-05-01-2.jpg");
    expect(allocateTargetName("2024-05-01", ".jpg", taken)).toBe("2024-05-01-3.jpg");
    expect(allocateTargetName("2024-05-01", ".jpg", taken)).toBe("2024-05-01-4.jpg");
  });
});

describe("parseMvhdPayload", () => {
  it("parses version 0 mvhd payload", () => {
    const payload = mvhdPayload(0, MVHD_EPOCH_OFFSET + UNIX_2023_03_15);
    expect(parseMvhdPayload(payload)?.getTime()).toBe(UNIX_2023_03_15 * 1000);
  });

  it("parses version 1 mvhd payload", () => {
    const payload = mvhdPayload(1, MVHD_EPOCH_OFFSET + UNIX_2023_03_15);
    expect(parseMvhdPayload(payload)?.getTime()).toBe(UNIX_2023_03_15 * 1000);
  });

  it("returns null for invalid payloads", () => {
    expect(parseMvhdPayload(Buffer.alloc(4))).toBeNull();
    const badVersion = mvhdPayload(0, MVHD_EPOCH_OFFSET + UNIX_2023_03_15);
    badVersion.writeUInt8(2, 0);
    expect(parseMvhdPayload(badVersion)).toBeNull();
  });
});

describe("resolveTakenTime (video)", () => {
  it("reads mvhd when moov is at the head", async () => {
    const file = join(workDir, "head.mp4");
    const mtime = new Date(2019, 0, 1);
    await makeFile(file, sampleMp4(MVHD_EPOCH_OFFSET + UNIX_2023_03_15), mtime);
    const result = await resolveTakenTime(file, mtime);
    expect(result.captured).toBe(true);
    expect(result.takenAt.getTime()).toBe(UNIX_2023_03_15 * 1000);
  });

  it("reads mvhd when moov is at the end of the file (phone recording layout)", async () => {
    const file = join(workDir, "tail.mp4");
    const mtime = new Date(2019, 0, 1);
    await makeFile(
      file,
      sampleMp4MoovAtEnd(MVHD_EPOCH_OFFSET + UNIX_2023_03_15),
      mtime,
    );
    const result = await resolveTakenTime(file, mtime);
    expect(result.captured).toBe(true);
    expect(result.takenAt.getTime()).toBe(UNIX_2023_03_15 * 1000);
  });

  it("falls back to mtime when there is no moov box", async () => {
    const file = join(workDir, "broken.mp4");
    const mtime = new Date(2024, 4, 1, 12, 0, 0);
    await makeFile(file, Buffer.from("not a video file at all"), mtime);
    const result = await resolveTakenTime(file, mtime);
    expect(result.captured).toBe(false);
    expect(result.takenAt.getTime()).toBe(mtime.getTime());
  });
});

describe("isSaneTime", () => {
  it("rejects times before 1990 and in the future", () => {
    expect(isSaneTime(new Date(1989, 11, 31).getTime())).toBe(false);
    expect(isSaneTime(Date.now() + 60_000)).toBe(false);
    expect(isSaneTime(new Date(2024, 4, 1).getTime())).toBe(true);
    expect(isSaneTime(Number.NaN)).toBe(false);
  });
});

describe("buildPlan", () => {
  it("rejects identical source and output directories", async () => {
    await expect(buildPlan(workDir, workDir)).rejects.toThrow("不能是同一个");
  });

  it("rejects output inside source", async () => {
    const nested = join(workDir, "out");
    await mkdir(nested);
    await expect(buildPlan(workDir, nested)).rejects.toThrow("内部");
  });

  it("classifies by mtime fallback, skips non-media, and resolves conflicts", async () => {
    const source = join(workDir, "src");
    const output = join(workDir, "out");
    await mkdir(source);
    await mkdir(join(output, "2024"), { recursive: true });
    const day = new Date(2024, 4, 1, 12, 0, 0);
    await makeFile(join(source, "IMG_1.JPG"), "a", day);
    await makeFile(join(source, "IMG_2.jpg"), "b", day);
    await makeFile(join(source, "notes.txt"), "c", day);
    await makeFile(join(output, "2024", "2024-05-01.jpg"), "existing");

    const plan = await buildPlan(source, output);
    expect(plan.skippedNonMedia).toBe(1);
    expect(plan.items).toHaveLength(2);
    for (const item of plan.items) {
      expect(item.year).toBe("2024");
      expect(item.timeSource).toBe("file");
    }
    const names = plan.items.map((item) => item.targetName).sort();
    expect(names).toEqual(["2024-05-01-2.jpg", "2024-05-01-3.jpg"]);
    for (const item of plan.items) {
      expect(item.targetPath).toBe(join(output, "2024", item.targetName));
    }
  });

  it("uses EXIF DateTimeOriginal for images", async () => {
    const source = join(workDir, "src");
    const output = join(workDir, "out");
    await mkdir(source);
    const old = new Date(2019, 0, 1);
    await makeFile(
      join(source, "photo.jpg"),
      sampleExifJpeg("2024:05:01 12:34:56"),
      old,
    );

    const plan = await buildPlan(source, output);
    expect(plan.items).toHaveLength(1);
    const item = plan.items[0];
    expect(item.timeSource).toBe("captured");
    expect(item.targetName).toBe("2024-05-01.jpg");
    expect(item.year).toBe("2024");
  });

  it("uses mp4 mvhd creation time as captured time", async () => {
    const source = join(workDir, "src");
    const output = join(workDir, "out");
    await mkdir(source);
    const old = new Date(2019, 0, 1);
    await makeFile(
      join(source, "clip.mp4"),
      sampleMp4(MVHD_EPOCH_OFFSET + UNIX_2023_03_15),
      old,
    );

    const plan = await buildPlan(source, output);
    expect(plan.items).toHaveLength(1);
    const item = plan.items[0];
    expect(item.timeSource).toBe("captured");
    const expectedLocal = new Date(UNIX_2023_03_15 * 1000);
    expect(item.year).toBe(String(expectedLocal.getFullYear()));
    expect(item.targetName).toBe(`${formatDateName(expectedLocal)}.mp4`);
  });
});

describe("executePlan", () => {
  it("moves files into year folders with content preserved", async () => {
    const source = join(workDir, "src");
    const output = join(workDir, "out");
    await mkdir(source);
    const day = new Date(2024, 4, 1, 12, 0, 0);
    await makeFile(join(source, "IMG_1.jpg"), "photo-data", day);

    const result = await executePlan(source, output);
    expect(result.moved).toBe(1);
    expect(result.failed).toEqual([]);
    const moved = await readFile(join(output, "2024", "2024-05-01.jpg"), "utf8");
    expect(moved).toBe("photo-data");
    await expect(stat(join(source, "IMG_1.jpg"))).rejects.toThrow();
    expect(await readdir(source)).toEqual([]);
  });

  it("collects per-file failures without aborting the rest", async () => {
    const source = join(workDir, "src");
    const output = join(workDir, "out");
    await mkdir(source);
    const day = new Date(2024, 4, 1, 12, 0, 0);
    await makeFile(join(source, "good.jpg"), "a", day);
    await makeFile(join(source, "bad.jpg"), "b", new Date(2025, 5, 2, 12, 0, 0));
    // 让 2025 年份路径被普通文件占用，mkdir 必然失败
    await mkdir(output);
    await writeFile(join(output, "2025"), "occupied");

    const result = await executePlan(source, output);
    expect(result.moved).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].fileName).toBe("bad.jpg");
    expect(result.failed[0].error).toBeTruthy();
    // 失败文件留在原地
    await stat(join(source, "bad.jpg"));
  });
});
