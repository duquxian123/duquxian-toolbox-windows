import { ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import type { WindowManager } from "./window-manager";

export class IpcBus {
  private readonly handlers = new Set<string>();

  constructor(private readonly windows: WindowManager) {}

  handle<T>(
    channel: string,
    handler: (payload: unknown, event: IpcMainInvokeEvent) => T | Promise<T>,
    options: { roles?: string[] } = {},
  ): void {
    if (this.handlers.has(channel)) {
      throw new Error(`IPC 通道 ${channel} 已存在`);
    }
    const roles = options.roles ?? ["main"];
    ipcMain.handle(channel, async (event, payload) => {
      const role = this.windows.roleFor(event.sender);
      const allowed =
        role !== null && (roles.includes(role) || roles.includes("*"));
      if (!allowed) {
        throw new Error("无权执行此操作");
      }
      return handler(payload, event);
    });
    this.handlers.add(channel);
  }

  remove(channel: string): void {
    if (!this.handlers.delete(channel)) {
      return;
    }
    ipcMain.removeHandler(channel);
  }

  send(channel: string, payload?: unknown): void {
    const window = this.windows.mainWindow;
    if (window && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}
