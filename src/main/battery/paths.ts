import { app } from "electron";
import { join } from "node:path";

export function batteryResourcePath(filename: string): string {
  const root = app.isPackaged
    ? join(process.resourcesPath, "battery")
    : join(app.getAppPath(), "resources", "battery");
  return join(root, filename);
}
