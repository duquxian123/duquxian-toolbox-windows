import { app } from "electron";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type {
  BatteryDevice,
  BatterySettings,
} from "../shared/types";
import { atomicJsonWrite, readJson } from "../../../main/fs-utils";
import type { Logger } from "../../../main/logger";
import {
  DEFAULT_BATTERY_SETTINGS,
  sanitizeBatterySettings,
} from "./settings";

interface BatteryStoreData {
  version: 1;
  migratedFromBatteryHub: boolean;
  devices: Record<string, BatteryDevice>;
  settings: BatterySettings;
}

const EMPTY_DATA = (): BatteryStoreData => ({
  version: 1,
  migratedFromBatteryHub: false,
  devices: {},
  settings: { ...DEFAULT_BATTERY_SETTINGS },
});

const MIGRATED_DEVICE_FIELDS = [
  "id",
  "product",
  "manufacturer",
  "driverId",
  "profile",
  "customName",
  "customIcon",
  "order",
  "hidden",
  "alertThreshold",
  "links",
  "identity",
] as const;

export function migrateDevices(source: unknown): Record<string, BatteryDevice> {
  if (!source || typeof source !== "object") return {};
  const devices = (source as { devices?: unknown }).devices;
  if (!devices || typeof devices !== "object") return {};
  const migrated: Record<string, BatteryDevice> = {};
  for (const [id, raw] of Object.entries(devices)) {
    if (!raw || typeof raw !== "object") continue;
    const sourceDevice = raw as Record<string, unknown>;
    const device: Record<string, unknown> = {};
    for (const field of MIGRATED_DEVICE_FIELDS) {
      if (sourceDevice[field] !== undefined) device[field] = sourceDevice[field];
    }
    if (typeof device.id !== "string") device.id = id;
    if (typeof device.product !== "string") device.product = "未知设备";
    if (typeof device.manufacturer !== "string") device.manufacturer = "";
    if (typeof device.driverId !== "string") device.driverId = "generic";
    migrated[id] = device as unknown as BatteryDevice;
  }
  return migrated;
}

export class BatteryStore {
  readonly filePath: string;
  private data: BatteryStoreData = EMPTY_DATA();
  private writeChain: Promise<void> = Promise.resolve();

  private constructor(
    rootDir: string,
    private readonly logger: Logger | null = null,
  ) {
    this.filePath = join(rootDir, "battery-hub.json");
  }

  static async create(
    rootDir: string,
    logger: Logger | null = null,
  ): Promise<BatteryStore> {
    const store = new BatteryStore(rootDir, logger);
    const legacyToolboxPath = join(
      app.getPath("userData"),
      "battery-hub.json",
    );
    let existing = await readJson<BatteryStoreData>(store.filePath);
    const migratedFromToolbox = !existing;
    if (!existing) {
      existing = await readJson<BatteryStoreData>(legacyToolboxPath);
    }
    if (existing) {
      store.data = {
        version: 1,
        migratedFromBatteryHub: !!existing.migratedFromBatteryHub,
        devices: existing.devices && typeof existing.devices === "object" ? existing.devices : {},
        settings: sanitizeBatterySettings(existing.settings),
      };
      if (migratedFromToolbox) {
        await store.persist();
        await rm(legacyToolboxPath, { force: true });
      }
      return store;
    }

    const legacyPath = join(app.getPath("appData"), "battery-hub", "battery-hub.json");
    const legacy = (
      process.env.TOOLBOX_DISABLE_BATTERY_MIGRATION === "1" ||
      !!process.env.TOOLBOX_TEST_USER_DATA
    )
      ? null
      : await readJson<unknown>(legacyPath).catch(() => null);
    store.data = {
      ...EMPTY_DATA(),
      migratedFromBatteryHub: !!legacy,
      devices: migrateDevices(legacy),
    };
    await store.persist();
    return store;
  }

  getDevices(): Record<string, BatteryDevice> {
    return structuredClone(this.data.devices);
  }

  getDevice(id: string): BatteryDevice | null {
    const device = this.data.devices[id];
    return device ? structuredClone(device) : null;
  }

  upsertDevice(id: string, patch: Partial<BatteryDevice>): BatteryDevice {
    const device = {
      ...(this.data.devices[id] ?? {}),
      ...patch,
      id,
    } as BatteryDevice;
    this.data.devices[id] = device;
    void this.persist();
    return structuredClone(device);
  }

  removeDevice(id: string): void {
    delete this.data.devices[id];
    void this.persist();
  }

  mergeDevices(keepId: string, dropId: string): void {
    const keep = this.data.devices[keepId];
    const drop = this.data.devices[dropId];
    if (!keep || !drop) return;
    const newest = (drop.lastReadingAt ?? 0) > (keep.lastReadingAt ?? 0) ? drop : keep;
    const history = [...(keep.history ?? []), ...(drop.history ?? [])]
      .sort((a, b) => a.t - b.t);
    this.data.devices[keepId] = {
      ...keep,
      customName: keep.customName ?? drop.customName ?? null,
      customIcon: keep.customIcon ?? drop.customIcon ?? null,
      alertThreshold: keep.alertThreshold ?? drop.alertThreshold ?? null,
      product: /_/.test(keep.product) ? drop.product : keep.product,
      identity: keep.identity ?? drop.identity,
      order: Math.min(keep.order ?? 1e9, drop.order ?? 1e9),
      hidden: !!(keep.hidden && drop.hidden),
      lastReading: newest.lastReading,
      lastReadingAt: newest.lastReadingAt,
      history,
      links: [...(keep.links ?? []), {
        id: drop.id,
        driverId: drop.driverId,
        profile: drop.profile ?? null,
      }, ...(drop.links ?? [])],
    };
    delete this.data.devices[dropId];
    void this.persist();
  }

  reorderDevices(ids: string[]): void {
    ids.forEach((id, index) => {
      if (this.data.devices[id]) this.data.devices[id].order = index;
    });
    void this.persist();
  }

  getSettings(): BatterySettings {
    return { ...this.data.settings };
  }

  updateSettings(patch: Partial<BatterySettings>): BatterySettings {
    this.data.settings = sanitizeBatterySettings(
      { ...this.data.settings, ...patch },
      this.data.settings,
    );
    void this.persist();
    return this.getSettings();
  }

  async flush(): Promise<void> {
    await this.persist();
  }

  private async persist(): Promise<void> {
    this.writeChain = this.writeChain
      .then(() => atomicJsonWrite(this.filePath, this.data))
      .catch((error) => {
        this.logger?.error("电量数据保存失败", { error });
        console.error("电量数据保存失败", error);
      });
    await this.writeChain;
  }
}
