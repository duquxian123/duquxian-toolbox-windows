import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createLogger, readLogSnapshot } from "../src/main/logger";

const roots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "toolbox-logger-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("structured logger", () => {
  it("writes scoped JSON lines and safe error details", () => {
    const logger = createLogger(join(temporaryRoot(), "logs"), {
      mirrorToConsole: false,
    }).child("hotkey");

    logger.info("注册成功", { accelerator: "Ctrl+1" });
    logger.error("注册异常", {
      error: new Error("occupied"),
    });

    const lines = readFileSync(logger.filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({
      level: "info",
      scope: "app:hotkey",
      message: "注册成功",
      data: JSON.stringify({ accelerator: "Ctrl+1" }),
    });
    expect(JSON.parse(lines[1]).data).toContain("occupied");
    expect(JSON.parse(lines[1]).data).toContain("stack");
  });

  it("rotates old files and preserves only the configured history", () => {
    const logger = createLogger(join(temporaryRoot(), "logs"), {
      maxBytes: 120,
      maxFiles: 2,
      mirrorToConsole: false,
    });
    const padding = "x".repeat(100);

    logger.info("one", padding);
    logger.info("two", padding);
    logger.info("three", padding);
    logger.info("four", padding);

    expect(existsSync(logger.filePath)).toBe(true);
    expect(existsSync(`${logger.filePath}.1`)).toBe(true);
    expect(existsSync(`${logger.filePath}.2`)).toBe(true);
    expect(existsSync(`${logger.filePath}.3`)).toBe(false);
  });

  it("contains data serialization failures and write failures", () => {
    const root = temporaryRoot();
    const logDirectory = join(root, "logs");
    const logger = createLogger(logDirectory, { mirrorToConsole: false });
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.info("circular", circular)).not.toThrow();
    expect(readFileSync(logger.filePath, "utf8")).toContain("[Circular]");

    rmSync(logDirectory, { recursive: true, force: true });
    writeFileSync(logDirectory, "not a directory");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => logger.warn("first failure")).not.toThrow();
    expect(() => logger.warn("second failure")).not.toThrow();
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("returns a complete-line tail and handles a missing file", async () => {
    const filePath = join(temporaryRoot(), "toolbox.log");
    writeFileSync(
      filePath,
      "oldest-record\nmiddle-record\nnewest-record\n",
      "utf8",
    );

    const snapshot = await readLogSnapshot(
      filePath,
      Buffer.byteLength("middle-record\nnewest-record\n") - 1,
    );
    expect(snapshot.truncated).toBe(true);
    expect(snapshot.content).toBe("newest-record\n");
    expect(snapshot.updatedAt).not.toBeNull();

    const missing = await readLogSnapshot(
      join(temporaryRoot(), "missing.log"),
    );
    expect(missing).toMatchObject({
      content: "",
      truncated: false,
      updatedAt: null,
    });
  });
});
