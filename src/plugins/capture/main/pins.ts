import { clipboard, ClipboardItem, nativeImage } from "electron";
import type { BrowserWindow } from "electron";
import { readFile, rm } from "node:fs/promises";
import { dirname } from "node:path";
import type { PluginContext } from "../../../main/plugin/types";
import type { PinInfo } from "../shared/types";

export class PinManager {
  private readonly pins = new Map<string, PinInfo>();
  private readonly windows = new Map<string, BrowserWindow>();

  constructor(private readonly ctx: PluginContext) {}

  async create(pin: PinInfo): Promise<PinInfo> {
    const maxWidth = 720;
    const maxHeight = 540;
    const ratio = Math.min(maxWidth / pin.width, maxHeight / pin.height, 1);
    const width = Math.max(140, Math.round(pin.width * ratio));
    const height = Math.max(90, Math.round(pin.height * ratio));

    this.pins.set(pin.id, pin);
    const window = await this.ctx.windows.create({
      role: "pin",
      view: "pin",
      params: { pinId: pin.id },
      options: {
        width,
        height,
        minWidth: 120,
        minHeight: 80,
        frame: false,
        show: false,
        title: "贴图",
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: true,
        hasShadow: true,
        backgroundColor: "#FBF8F2",
      },
      onClosed: () => {
        this.pins.delete(pin.id);
        this.windows.delete(pin.id);
        void rm(dirname(pin.imagePath), { recursive: true, force: true });
      },
    });
    this.windows.set(pin.id, window);
    if (!window.isDestroyed()) {
      window.setAlwaysOnTop(true, "floating");
      window.setAspectRatio(pin.width / pin.height);
      window.show();
      window.focus();
    }
    return pin;
  }

  get(pinId: string): PinInfo {
    const pin = this.pins.get(pinId);
    if (!pin) {
      throw new Error("贴图不存在");
    }
    return pin;
  }

  async copy(pinId: string): Promise<void> {
    const pin = this.get(pinId);
    const image = nativeImage.createFromBuffer(await readFile(pin.imagePath));
    if (image.isEmpty()) {
      throw new Error("贴图内容无效");
    }
    await clipboard.write([
      new ClipboardItem({
        "image/png": new Blob([await readFile(pin.imagePath)], {
          type: "image/png",
        }),
      }),
    ]);
  }

  close(pinId: string): void {
    const window = this.windows.get(pinId);
    if (window) {
      this.ctx.windows.close(window);
    }
    this.windows.delete(pinId);
    this.pins.delete(pinId);
  }

  dispose(): void {
    for (const window of this.windows.values()) {
      this.ctx.windows.close(window);
    }
    this.windows.clear();
    this.pins.clear();
  }
}
