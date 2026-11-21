export interface HotkeyPort {
  register(
    accelerator: string,
    handler: () => void,
  ): { ok: boolean; error?: string };
  unregister(accelerator: string): void;
}

export class PluginHotkeyScope {
  private readonly owned = new Set<string>();

  constructor(private readonly hotkeys: HotkeyPort) {}

  register(
    accelerator: string,
    handler: () => void,
  ): { ok: boolean; error?: string } {
    const result = this.hotkeys.register(accelerator, handler);
    if (result.ok) {
      this.owned.add(accelerator);
    }
    return result;
  }

  unregister(accelerator: string): void {
    if (!this.owned.delete(accelerator)) {
      return;
    }
    this.hotkeys.unregister(accelerator);
  }

  dispose(): void {
    for (const accelerator of this.owned) {
      this.hotkeys.unregister(accelerator);
    }
    this.owned.clear();
  }
}
