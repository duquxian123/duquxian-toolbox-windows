// @ts-nocheck
import type {
  BatteryDevice,
  BatteryDeviceRoute,
  BatteryLiveDevice,
  BatterySettings,
} from "../shared/types";
import { BatteryHidClient } from "./hid/client";
import { detectDriver, driverById } from "./hid/drivers";
import type { BatteryLogicalDevice } from "./hid/catalog";
import { pushBatteryHistory } from "./history";
import { identityOf, routesOf } from "./identity";
import {
  getSystemBattery,
  hasSystemBatteryScan,
  isSystemBatteryId,
  listSystemBatteries,
  scanSystemBatteries,
  startSystemBatteryWatcher,
  stopSystemBatteryWatcher,
} from "./system-batteries";
import {
  isBatteryMonitorActive,
  startBatteryMonitor,
  stopAllBatteryMonitors,
} from "./monitor";
import type { BatteryNotifier } from "./notifier";
import type { BatteryStore } from "./store";
import type { Logger } from "../../../main/logger";
import {
  batteryReadingDetails,
  batteryRouteDetails,
  outOfRangeRawPercent,
} from "./logging";

const LIVE_TTL_MS = 5 * 60 * 1000;
const TREND_LEN = 4;
const TURNED_OFF = /\bis off$/i;
const NOT_ANSWERING = /\bis not answering$/i;

export class BatteryManager {
  private timer: NodeJS.Timeout | null = null;
  private polling = false;
  private holds = 0;
  private liveCache: BatteryLiveDevice[] | null = null;
  private logicalCache: BatteryLogicalDevice[] = [];
  private liveCacheAt = 0;
  private readonly identities = new Map<string, string | null>();
  private readonly trend = new Map<string, number[]>();
  private onUpdate: (device: BatteryDevice) => void = () => {};
  private onDevicesChanged: (id?: string | null) => void = () => {};
  private readonly hid = new BatteryHidClient();

  constructor(
    private readonly store: BatteryStore,
    private readonly notifier: BatteryNotifier,
    private readonly logger: Logger,
  ) {}

  setListeners(
    onUpdate: (device: BatteryDevice) => void,
    onDevicesChanged: (id?: string | null) => void,
  ): void {
    this.onUpdate = onUpdate;
    this.onDevicesChanged = onDevicesChanged;
  }

  async start(): Promise<void> {
    this.stopTimer();
    const interval = Math.max(10, this.store.getSettings().pollIntervalSec) * 1000;
    this.logger.info("电量轮询已启动", { intervalSec: interval / 1000 });
    await this.safePoll();
    this.timer = setInterval(() => void this.safePoll(), interval);
  }

  restart(): void {
    this.stopTimer();
    const interval = Math.max(10, this.store.getSettings().pollIntervalSec) * 1000;
    void this.safePoll();
    this.timer = setInterval(() => void this.safePoll(), interval);
  }

  async stop(): Promise<void> {
    this.logger.info("电量轮询正在停止");
    this.stopTimer();
    stopAllBatteryMonitors();
    stopSystemBatteryWatcher();
    this.hid.stop();
  }

  async pollNow(): Promise<void> {
    await this.pollOnce({ force: true });
  }

  async listCandidates(): Promise<BatteryLiveDevice[]> {
    let hidDevices;
    let systemDevices;
    try {
      [hidDevices, systemDevices] = await Promise.all([
        this.hid.enumerate(),
        scanSystemBatteries(),
      ]);
    } catch (error) {
      this.logger.error("电量设备扫描失败", { error });
      throw error;
    }
    this.logger.info("电量设备扫描完成", {
      hidCount: hidDevices.length,
      windowsCount: systemDevices.length,
    });
    const claimed = new Set(
      Object.values(this.store.getDevices()).flatMap(
        (device) => routesOf(device).map((route) => route.id),
      ),
    );
    const hid = hidDevices.map((device) => {
      const suggestedDriver = detectDriver(device)?.id ?? null;
      return {
        id: device.id,
        product: suggestedDriver === "gamesir-connect"
          ? "GameSir Nova 2 Lite（启明星2）"
          : device.product,
        manufacturer: suggestedDriver === "gamesir-connect" ? "GameSir" : device.manufacturer,
        serialNumber: device.serialNumber,
        vendorId: device.vendorId,
        productId: device.productId,
        channelCount: device.channels.length,
        suggestedDriver,
      };
    });
    const windows = systemDevices.map((device) => ({
      id: device.id,
      product: device.name,
      manufacturer: device.kind === "xinput" ? "Xbox 无线控制器" : "Bluetooth",
      channelCount: 0,
      suggestedDriver: "system",
    }));
    return [...windows, ...hid]
      .filter((device) => !claimed.has(device.id))
      .sort((a, b) => Number(!!b.suggestedDriver) - Number(!!a.suggestedDriver));
  }

  async captureCalibration(id: string) {
    return this.withPollingPaused(async () => {
      const live = (await this.hid.enumerate()).find((device) => device.id === id);
      if (!live) throw new Error("设备未连接");
      try {
        return await this.hid.capture(live);
      } catch (error) {
        this.logger.error("电量校准报文捕获失败", { deviceId: id, error });
        throw error;
      }
    });
  }

  updateSettings(patch: Partial<BatterySettings>): BatterySettings {
    const settings = this.store.updateSettings(patch);
    if (Object.prototype.hasOwnProperty.call(patch, "pollIntervalSec")) this.restart();
    return settings;
  }

  async diagnostics() {
    const checks = [];
    let devices = [];
    try {
      devices = await this.hid.enumerate();
      checks.push({
        id: "hid",
        title: "HID 电量读取",
        status: "ok",
        detail: "node-hid 工作进程能够枚举外设。",
      });
    } catch (error) {
      this.logger.warn("HID 电量读取检查失败", { error });
      checks.push({
        id: "hid",
        title: "HID 电量读取",
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
        fix: "重新启动工具箱；如果仍然失败，请重新安装包含 node-hid 的版本。",
      });
    }
    checks.push({
      id: "devices",
      title: "已添加设备",
      status: Object.keys(this.store.getDevices()).length ? "ok" : "warn",
      detail: Object.keys(this.store.getDevices()).length
        ? `已配置 ${Object.keys(this.store.getDevices()).length} 个设备。`
        : "尚未添加无线外设。",
    });
    checks.push({
      id: "windows-battery",
      title: "Windows 电量回退",
      status: hasSystemBatteryScan() ? "ok" : "warn",
      detail: hasSystemBatteryScan()
        ? "Windows 蓝牙与 Xbox 电量读取可用。"
        : "尚未取得 Windows 电量快照。",
    });
    const failed = checks.filter((check) => check.status === "fail").length;
    const warned = checks.some((check) => check.status === "warn");
    return {
      verdict: failed
        ? {
            tone: "bad",
            title: "电量模块存在问题",
            detail: "请根据下方检查结果处理后再试。",
          }
        : warned
          ? {
              tone: "warn",
              title: "基本正常",
              detail: "当前没有失败项，但还有信息未准备完成。",
            }
          : {
              tone: "good",
              title: "电量模块工作正常",
              detail: `已发现 ${devices.length} 个 HID 通道组。`,
            },
      checks,
    };
  }

  private stopTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async safePoll(): Promise<void> {
    try {
      await this.pollOnce();
    } catch (error) {
      this.logger.error("电量轮询失败", { error });
      console.error("电量轮询失败", error);
    }
  }

  private async withPollingPaused<T>(callback: () => Promise<T>): Promise<T> {
    this.holds += 1;
    try {
      while (this.polling) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return await callback();
    } finally {
      this.holds -= 1;
    }
  }

  private async pollOnce(options: { force?: boolean; only?: string[] | null } = {}): Promise<void> {
    if (this.polling || this.holds > 0) return;
    this.polling = true;
    try {
      if (options.force) {
        this.liveCache = null;
        await scanSystemBatteries();
      }
      const live = await this.getLiveDevices(!!options.force);
      await this.reconcile(live);
      const saved = this.store.getDevices();
      const usesWindows = Object.values(saved).some(
        (device) =>
          !device.hidden &&
          routesOf(device).some((route) => isSystemBatteryId(route.id)),
      );
      if (usesWindows || isSystemBatteryId(options.only?.[0] ?? "")) {
        startSystemBatteryWatcher();
      } else {
        stopSystemBatteryWatcher();
      }

      for (const [id, card] of Object.entries(saved)) {
        if (card.hidden || (options.only && !options.only.includes(id))) continue;
        const driver = driverById(card.driverId);
        if (driver.eventDriven) {
          this.startEventMonitor(id, card);
          continue;
        }
        await this.pollDevice(id, card, live);
      }
    } finally {
      this.polling = false;
    }
  }

  private startEventMonitor(id: string, card: BatteryDevice): void {
    if (isBatteryMonitorActive(id)) return;
    startBatteryMonitor(
      id,
      (reading) => this.commitReading(id, reading),
      (state) => {
        this.logger.info("事件设备连接状态变化", {
          deviceId: id,
          state,
          previousError: card.lastError ?? null,
        });
        const patch = state === "connected"
          ? { online: true, lastError: null }
          : state === "python-missing"
            ? { online: true, lastError: "需要 Python + hid 模块" }
            : state === "off"
              ? { online: false, lastError: "headset is off" }
              : { online: false, lastError: "not connected" };
        this.store.upsertDevice(id, patch);
        this.onUpdate(this.store.getDevice(id)!);
        this.onDevicesChanged(null);
      },
    );
    if (!card.lastReading && !card.lastError) {
      const updated = this.store.upsertDevice(id, {
        online: true,
        lastError: "等待耳机上报电量",
      });
      this.onUpdate(updated);
    }
  }

  private async pollDevice(id: string, card: BatteryDevice, live: BatteryLiveDevice[]): Promise<void> {
    let result = null;
    let usedRoute = null;
    for (const route of routesOf(card)) {
      if (isSystemBatteryId(route.id)) {
        const system = getSystemBattery(route.id);
        if (system?.connected) {
          result = {
            status: "ok",
            reading: { capacity: system.capacity, charging: null, voltageMv: null },
          };
          usedRoute = route;
          break;
        }
        result = {
          status: "error",
          error: new Error(hasSystemBatteryScan() ? "not connected" : "等待 Windows 扫描"),
          route,
        };
        continue;
      }
      const candidate = live.find((device) => device.id === route.id);
      if (!candidate) {
        result = { status: "error", error: new Error("not connected"), route };
        continue;
      }
      try {
        const internal = this.logicalCache.find((device) => device.id === route.id);
        if (!internal) throw new Error("not connected");
        const reading = await this.hid.readBattery(
          route.driverId,
          internal,
          route.profile ?? null,
        );
        result = { status: "ok", reading };
        usedRoute = route;
        break;
      } catch (error) {
        result = { status: "error", error, route };
      }
    }

    if (!result) {
      result = { status: "error", error: new Error("not connected"), route: null };
    }
    if (result.status === "ok") {
      this.commitReading(id, result.reading, usedRoute);
      return;
    }
    const message = result.error?.message ?? "not connected";
    const expected = /not connected|等待 Windows 扫描/i.test(message) ||
      (TURNED_OFF.test(message) || NOT_ANSWERING.test(message));
    const patch = {
      lastError: message,
      online: !expected,
      failedReads: expected ? 0 : (card.failedReads ?? 0) + 1,
    };
    const details = {
      ...batteryRouteDetails(id, card, result.route),
      message,
      expected,
      failedReads: patch.failedReads,
    };
    if (expected) {
      this.logger.warn("电量读取失败", details);
    } else {
      this.logger.error("电量读取失败", {
        ...details,
        error: result.error,
      });
    }
    this.store.upsertDevice(id, patch);
    this.onUpdate(this.store.getDevice(id)!);
    this.onDevicesChanged(null);
  }

  private commitReading(id: string, reading, route: BatteryDeviceRoute | null = null): void {
    const card = this.store.getDevice(id);
    if (!card || card.hidden) return;
    let charging = reading.charging;
    if (charging === null || charging === undefined) {
      const trend = [...(this.trend.get(id) ?? []), reading.capacity].slice(-TREND_LEN);
      this.trend.set(id, trend);
      charging = trend.length >= 2 && trend.at(-1) > trend[0];
    }
    const now = Date.now();
    const details = batteryReadingDetails(id, card, reading, route);
    const rawPercent = outOfRangeRawPercent(
      reading,
      route?.profile ?? card.profile,
    );
    if (rawPercent !== null) {
      this.logger.warn("电量读数超出百分比范围", {
        ...details,
        rawPercent,
        expectedRange: [0, 100],
      });
    } else {
      this.logger.info("电量读取成功", details);
    }
    const updated = this.store.upsertDevice(id, {
      lastReading: { ...reading, charging },
      lastReadingAt: now,
      lastError: null,
      failedReads: 0,
      online: true,
      history: pushBatteryHistory(card.history, reading.capacity, charging, now),
    });
    this.notifier.check(updated);
    this.onUpdate(updated);
    this.onDevicesChanged(null);
  }

  private async getLiveDevices(force: boolean): Promise<BatteryLiveDevice[]> {
    if (!force && this.liveCache && Date.now() - this.liveCacheAt < LIVE_TTL_MS) {
      return this.liveCache;
    }
    const devices = await this.hid.enumerate();
    this.logger.info("HID 设备枚举完成", {
      count: devices.length,
      devices: devices.map((device) => ({
        deviceId: device.id,
        product: device.product,
        manufacturer: device.manufacturer,
        vendorId: device.vendorId,
        productId: device.productId,
        channelCount: device.channels.length,
      })),
    });
    this.logicalCache = devices;
    this.liveCache = devices.map((device) => ({
      id: device.id,
      product: device.product,
      manufacturer: device.manufacturer,
      serialNumber: device.serialNumber,
      vendorId: device.vendorId,
      productId: device.productId,
      channelCount: device.channels.length,
      suggestedDriver: detectDriver(device)?.id ?? null,
    }));
    this.liveCacheAt = Date.now();
    return this.liveCache;
  }

  private async reconcile(live: BatteryLiveDevice[]): Promise<void> {
    let changed = false;
    for (const device of live) {
      const card = this.store.getDevice(device.id);
      if (card && card.driverId === "generic" && device.suggestedDriver) {
        this.store.upsertDevice(card.id, {
          driverId: device.suggestedDriver,
          profile: null,
          lastError: null,
        });
        changed = true;
      }
    }

    const grouped = new Map<string, BatteryDevice[]>();
    for (const card of Object.values(this.store.getDevices())) {
      const identity = identityOf(card);
      if (!identity) continue;
      const group = grouped.get(identity) ?? [];
      group.push(card);
      grouped.set(identity, group);
    }
    for (const cards of grouped.values()) {
      if (cards.length < 2) continue;
      const keep = cards.reduce((best, card) => {
        const score = (device: BatteryDevice) =>
          (device.customName ? 1e6 : 0) + (device.history?.length ?? 0);
        return score(card) > score(best) ? card : best;
      });
      for (const card of cards) {
        if (card.id === keep.id) continue;
        this.store.mergeDevices(keep.id, card.id);
        this.onDevicesChanged(card.id);
        changed = true;
      }
    }
    if (changed) this.onDevicesChanged(null);
  }
}
