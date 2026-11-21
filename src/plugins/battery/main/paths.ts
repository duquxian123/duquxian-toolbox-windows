import { app } from "electron";
import { join } from "node:path";

export function batteryResourcePath(filename: string): string {
  const root = app.isPackaged
    ? join(process.resourcesPath, "plugins", "battery", "resources")
    : join(app.getAppPath(), "src", "plugins", "battery", "resources");
  return join(root, filename);
}
