import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AppLogSnapshot } from "../shared/types";

export type LogLevel = "info" | "warn" | "error";

export interface Logger {
  readonly filePath: string;
  child(scope: string): Logger;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export interface LoggerOptions {
  maxBytes?: number;
  maxFiles?: number;
  mirrorToConsole?: boolean;
}

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_FILES = 5;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_DATA_LENGTH = 8_000;

class LogSink {
  readonly filePath: string;
  private readonly maxBytes: number;
  private readonly maxFiles: number;
  private readonly mirrorToConsole: boolean;
  private currentBytes = 0;
  private writeFailureReported = false;

  constructor(
    logDirectory: string,
    options: LoggerOptions,
  ) {
    this.filePath = join(logDirectory, "toolbox.log");
    this.maxBytes = Math.max(1, options.maxBytes ?? DEFAULT_MAX_BYTES);
    this.maxFiles = Math.max(0, options.maxFiles ?? DEFAULT_MAX_FILES);
    this.mirrorToConsole = options.mirrorToConsole ?? true;
    try {
      mkdirSync(logDirectory, { recursive: true });
      this.currentBytes = existsSync(this.filePath)
        ? statSync(this.filePath).size
        : 0;
    } catch (error) {
      this.reportFailure(error);
    }
  }

  write(level: LogLevel, scope: string, message: string, data?: unknown): void {
    const record = {
      time: new Date().toISOString(),
      level,
      scope,
      message: truncate(message, MAX_MESSAGE_LENGTH),
      ...(data === undefined
        ? {}
        : { data: truncate(serialize(data), MAX_DATA_LENGTH) }),
    };
    const line = `${JSON.stringify(record)}\n`;

    try {
      if (
        this.currentBytes > 0 &&
        this.currentBytes + Buffer.byteLength(line) > this.maxBytes
      ) {
        this.rotate();
      }
      appendFileSync(this.filePath, line, "utf8");
      this.currentBytes += Buffer.byteLength(line);
    } catch (error) {
      this.reportFailure(error);
    }

    if (this.mirrorToConsole) {
      console[level](`[${scope}] ${message}`, data ?? "");
    }
  }

  private rotate(): void {
    if (this.maxFiles === 0) {
      rmSync(this.filePath, { force: true });
      this.currentBytes = 0;
      return;
    }

    const oldest = `${this.filePath}.${this.maxFiles}`;
    rmSync(oldest, { force: true });
    for (let index = this.maxFiles; index >= 1; index -= 1) {
      const source =
        index === 1 ? this.filePath : `${this.filePath}.${index - 1}`;
      const destination = `${this.filePath}.${index}`;
      if (!existsSync(source)) {
        continue;
      }
      if (existsSync(destination)) {
        rmSync(destination, { force: true });
      }
      renameSync(source, destination);
    }
    this.currentBytes = 0;
  }

  private reportFailure(error: unknown): void {
    if (this.writeFailureReported) {
      return;
    }
    this.writeFailureReported = true;
    console.error("日志写入失败", error);
  }
}

export class ScopedLogger implements Logger {
  constructor(
    private readonly sink: LogSink,
    private readonly scope: string,
  ) {}

  get filePath(): string {
    return this.sink.filePath;
  }

  child(scope: string): Logger {
    return new ScopedLogger(this.sink, `${this.scope}:${scope}`);
  }

  info(message: string, data?: unknown): void {
    this.sink.write("info", this.scope, message, data);
  }

  warn(message: string, data?: unknown): void {
    this.sink.write("warn", this.scope, message, data);
  }

  error(message: string, data?: unknown): void {
    this.sink.write("error", this.scope, message, data);
  }
}

export function createLogger(
  logDirectory: string,
  options: LoggerOptions = {},
): Logger {
  const sink = new LogSink(logDirectory, options);
  return new ScopedLogger(sink, "app");
}

export async function readLogSnapshot(
  filePath: string,
  maxBytes = 512 * 1024,
): Promise<AppLogSnapshot> {
  try {
    const [file, metadata] = await Promise.all([
      readFile(filePath),
      stat(filePath),
    ]);
    const truncated = file.length > Math.max(1, maxBytes);
    let content = truncated
      ? file.subarray(file.length - maxBytes)
      : file;
    if (truncated) {
      const firstLineBreak = content.indexOf(0x0a);
      if (firstLineBreak >= 0) {
        content = content.subarray(firstLineBreak + 1);
      }
    }
    return {
      content: content.toString("utf8"),
      filePath,
      truncated,
      updatedAt: metadata.mtimeMs,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {
        content: "",
        filePath,
        truncated: false,
        updatedAt: null,
      };
    }
    throw error;
  }
}

function serialize(value: unknown): string {
  const seen = new WeakSet<object>();
  try {
    return (
      JSON.stringify(value, (_key, item: unknown) => {
        if (item instanceof Error) {
          return {
            name: item.name,
            message: item.message,
            stack: item.stack,
          };
        }
        if (item && typeof item === "object") {
          if (seen.has(item)) {
            return "[Circular]";
          }
          seen.add(item);
        }
        return item;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}…[truncated]`
    : value;
}
