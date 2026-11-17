export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runAction(
  action: () => Promise<unknown>,
  success: string,
  notify: (message: string, type?: "success" | "error" | "info") => void,
): Promise<boolean> {
  try {
    await action();
    notify(success);
    return true;
  } catch (error) {
    notify(errorMessage(error), "error");
    return false;
  }
}

