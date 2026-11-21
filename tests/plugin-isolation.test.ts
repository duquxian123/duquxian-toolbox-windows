import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { moveDirectoryIfMissing } from "../src/main/fs-utils";
import { MediaRegistry } from "../src/main/media-registry";
import { removeOrphanPluginData } from "../src/main/plugin/cleanup";
import { PluginHotkeyScope } from "../src/main/plugin/hotkey-scope";
import {
  pluginChannel,
  pluginMediaSource,
  pluginRole,
  pluginView,
} from "../src/main/plugin/namespace";

describe("plugin namespaces", () => {
  it("prefixes all shared names with the plugin id", () => {
    expect(pluginChannel("capture", "start")).toBe(
      "plugin:capture:start",
    );
    expect(pluginRole("capture", "overlay")).toBe(
      "plugin:capture:overlay",
    );
    expect(pluginView("capture", "pin")).toBe("capture:pin");
    expect(pluginMediaSource("capture", "pins")).toBe("capture:pins");
  });

  it("rejects names that already contain a namespace separator", () => {
    expect(() => pluginChannel("capture", "capture:start")).toThrow();
    expect(() => pluginRole("capture", "capture:overlay")).toThrow();
  });
});

describe("plugin media sources", () => {
  it("builds namespaced URLs and removes only the owned source", () => {
    const registry = new MediaRegistry();
    const pins = registry.registerSource(
      "capture",
      "pins",
      join(tmpdir(), "toolbox-pins"),
    );
    const sessions = registry.registerSource(
      "capture",
      "sessions",
      join(tmpdir(), "toolbox-sessions"),
    );

    expect(pins.url("pin-1", "final.png")).toBe(
      "toolbox://media/capture%3Apins/pin-1/final.png",
    );
    pins.dispose();
    expect(registry.get("capture:pins")).toBeNull();
    expect(registry.get("capture:sessions")).not.toBeNull();
    sessions.dispose();
  });
});

describe("plugin data cleanup", () => {
  it("deletes only orphan directories and preserves known plugin data", async () => {
    const root = await mkdtemp(join(tmpdir(), "toolbox-plugin-cleanup-"));
    try {
      await mkdir(join(root, "known"), { recursive: true });
      await mkdir(join(root, "removed"), { recursive: true });
      await writeFile(join(root, "known", "settings.json"), "{}");
      await writeFile(join(root, "removed", "state.json"), "{}");
      await writeFile(join(root, "not-a-plugin.txt"), "keep");

      await removeOrphanPluginData(root, new Set(["known"]));

      expect(await readFile(join(root, "known", "settings.json"), "utf8")).toBe(
        "{}",
      );
      await expect(readFile(join(root, "removed", "state.json"))).rejects.toThrow();
      expect(await readFile(join(root, "not-a-plugin.txt"), "utf8")).toBe(
        "keep",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("plugin hotkeys", () => {
  it("registers and releases only accelerators owned by one plugin", () => {
    const port = {
      register: vi.fn(() => ({ ok: true })),
      unregister: vi.fn(),
    };
    const scope = new PluginHotkeyScope(port);

    scope.register("Ctrl+Shift+A", () => {});
    scope.unregister("Ctrl+Shift+B");
    scope.unregister("Ctrl+Shift+A");
    scope.register("Ctrl+Shift+C", () => {});
    scope.dispose();

    expect(port.unregister.mock.calls).toEqual([
      ["Ctrl+Shift+A"],
      ["Ctrl+Shift+C"],
    ]);
  });
});

describe("legacy data migration", () => {
  it("moves a legacy directory only when the destination is absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "toolbox-migration-"));
    try {
      const source = join(root, "old", "sessions");
      const destination = join(root, "plugins", "capture", "sessions");
      await mkdir(source, { recursive: true });
      await writeFile(join(source, "session.json"), "migrated");

      await moveDirectoryIfMissing(source, destination);

      expect(await readFile(join(destination, "session.json"), "utf8")).toBe(
        "migrated",
      );
      await expect(readFile(join(source, "session.json"))).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
