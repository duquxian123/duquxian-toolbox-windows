import type {
  PluginContext,
  PluginMainModule,
  TrayContribution,
} from "../../../main/plugin/types";
import type {
  BatteryAddRequest,
  BatteryDevice,
  BatterySettings,
} from "../shared/types";
import { BatteryManager } from "./manager";
import { BatteryNotifier } from "./notifier";
import { BatteryStore } from "./store";

let ctx: PluginContext;
let store: BatteryStore;
let manager: BatteryManager;

function statusOf(device: BatteryDevice): string {
  const name = device.customName || device.product || "外设";
  if (device.online === false) return `${name}：未连接`;
  if (typeof device.lastReading?.capacity === "number") {
    const charging = device.lastReading.charging ? "，充电中" : "";
    return `${name}：${device.lastReading.capacity}%${charging}`;
  }
  return `${name}：等待读数`;
}

function traySection(): TrayContribution | null {
  const devices = Object.values(store.getDevices()).filter((device) => !device.hidden);
  if (!store.getSettings().trayEnabled || devices.length === 0) {
    return null;
  }
  return {
    tooltipLines: devices.slice(0, 5).map(statusOf),
    items: [
      {
        label: "Battery Hub",
        submenu: [
          ...devices.map((device) => ({
            label: statusOf(device),
            click: () => void ctx.windows.showMain("battery"),
          })),
          { type: "separator" as const },
          {
            label: "打开 Battery Hub",
            click: () => void ctx.windows.showMain("battery"),
          },
        ],
      },
    ],
  };
}

function readId(payload: unknown): string {
  const id = (payload as { id?: unknown })?.id;
  if (typeof id !== "string") {
    throw new Error("设备参数无效");
  }
  return id;
}

export default {
  async setup(pluginCtx) {
    ctx = pluginCtx;
    store = await BatteryStore.create(
      pluginCtx.userDataDir,
      pluginCtx.log.child("store"),
    );
    const notifier = new BatteryNotifier(store, () => {
      void ctx.windows.showMain("battery");
    });
    manager = new BatteryManager(
      store,
      notifier,
      pluginCtx.log.child("manager"),
    );
    manager.setListeners(
      (device) => {
        ctx.ipc.send("update", device);
        ctx.tray.refresh();
      },
      () => {
        ctx.ipc.send("devices-changed");
        ctx.tray.refresh();
      },
    );

    ctx.ipc.handle("list-candidates", () => manager.listCandidates());
    ctx.ipc.handle("list-devices", () => store.getDevices());

    ctx.ipc.handle("add", (payload) => {
      const request = payload as BatteryAddRequest;
      if (
        !request ||
        typeof request.id !== "string" ||
        typeof request.driverId !== "string" ||
        typeof request.product !== "string" ||
        typeof request.manufacturer !== "string"
      ) {
        throw new Error("设备参数无效");
      }
      const device = store.upsertDevice(request.id, {
        driverId: request.driverId,
        profile: request.profile ?? null,
        product: request.product,
        manufacturer: request.manufacturer,
        hidden: false,
      });
      ctx.log.info("电量设备已添加", {
        deviceId: request.id,
        product: request.product,
        manufacturer: request.manufacturer,
        driverId: request.driverId,
      });
      manager.restart();
      ctx.tray.refresh();
      return device;
    });

    ctx.ipc.handle("remove", (payload) => {
      const id = readId(payload);
      store.removeDevice(id);
      ctx.log.info("电量设备已移除", { deviceId: id });
      manager.restart();
      ctx.tray.refresh();
    });

    ctx.ipc.handle("rename", (payload) => {
      const { id, name } = payload as { id?: unknown; name?: unknown };
      if (typeof id !== "string" || typeof name !== "string") {
        throw new Error("设备参数无效");
      }
      const device = store.upsertDevice(id, {
        customName: name.trim().slice(0, 40) || null,
      });
      ctx.log.info("电量设备已重命名", {
        deviceId: id,
        name: device.customName,
      });
      manager.restart();
      ctx.tray.refresh();
      return device;
    });

    ctx.ipc.handle("set-icon", (payload) => {
      const { id, icon } = payload as { id?: unknown; icon?: unknown };
      if (typeof id !== "string") {
        throw new Error("设备参数无效");
      }
      const customIcon =
        typeof icon === "string"
          ? Array.from(icon).slice(0, 4).join("").trim() || null
          : null;
      const device = store.upsertDevice(id, { customIcon });
      ctx.log.info("电量设备图标已更新", { deviceId: id });
      return device;
    });

    ctx.ipc.handle("set-hidden", (payload) => {
      const { id, hidden } = payload as { id?: unknown; hidden?: unknown };
      if (typeof id !== "string") {
        throw new Error("设备参数无效");
      }
      const device = store.upsertDevice(id, { hidden: !!hidden });
      ctx.log.info("电量设备显示状态已更新", {
        deviceId: id,
        hidden: device.hidden,
      });
      manager.restart();
      ctx.tray.refresh();
      return device;
    });

    ctx.ipc.handle("set-alert", (payload) => {
      const { id, threshold } = payload as {
        id?: unknown;
        threshold?: unknown;
      };
      if (typeof id !== "string") {
        throw new Error("设备参数无效");
      }
      const numeric = Number(threshold);
      const alertThreshold =
        threshold == null || Number.isNaN(numeric)
          ? null
          : Math.max(5, Math.min(95, Math.round(numeric / 5) * 5));
      return store.upsertDevice(id, { alertThreshold });
    });

    ctx.ipc.handle("reorder", (payload) => {
      const ids = (payload as { ids?: unknown })?.ids;
      if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
        throw new Error("设备顺序无效");
      }
      store.reorderDevices(ids);
    });

    ctx.ipc.handle("poll-now", async () => {
      ctx.log.info("手动刷新电量");
      await manager.pollNow();
    });

    ctx.ipc.handle("capture", async (payload) => {
      const id = readId(payload);
      ctx.log.info("开始捕获电量校准报文", { deviceId: id });
      const frames = await manager.captureCalibration(id);
      ctx.log.info("电量校准报文捕获完成", {
        deviceId: id,
        frameCount: frames.length,
      });
      return frames;
    });

    ctx.ipc.handle("get-settings", () => store.getSettings());

    ctx.ipc.handle("update-settings", (payload) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("电量设置无效");
      }
      const updated = manager.updateSettings(payload as Partial<BatterySettings>);
      ctx.log.info("电量设置已更新", { keys: Object.keys(payload) });
      ctx.tray.refresh();
      return updated;
    });

    ctx.ipc.handle("diagnostics", async () => {
      ctx.log.info("开始电量诊断");
      const result = await manager.diagnostics();
      ctx.log.info("电量诊断完成", {
        verdict: result.verdict.tone,
        checks: result.checks,
      });
      return result;
    });

    ctx.tray.contribute(traySection);
  },

  async start() {
    ctx.log.info("Battery Hub 已启动");
    await manager.start();
  },

  async stop() {
    ctx.log.info("Battery Hub 正在停止");
    await manager?.stop();
  },
} satisfies PluginMainModule;
