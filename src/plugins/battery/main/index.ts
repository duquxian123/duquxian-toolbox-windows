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
    store = await BatteryStore.create(pluginCtx.userDataDir);
    const notifier = new BatteryNotifier(store, () => {
      void ctx.windows.showMain("battery");
    });
    manager = new BatteryManager(store, notifier);
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
      manager.restart();
      ctx.tray.refresh();
      return device;
    });

    ctx.ipc.handle("remove", (payload) => {
      store.removeDevice(readId(payload));
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
      return store.upsertDevice(id, { customIcon });
    });

    ctx.ipc.handle("set-hidden", (payload) => {
      const { id, hidden } = payload as { id?: unknown; hidden?: unknown };
      if (typeof id !== "string") {
        throw new Error("设备参数无效");
      }
      const device = store.upsertDevice(id, { hidden: !!hidden });
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
      await manager.pollNow();
    });

    ctx.ipc.handle("capture", (payload) =>
      manager.captureCalibration(readId(payload)),
    );

    ctx.ipc.handle("get-settings", () => store.getSettings());

    ctx.ipc.handle("update-settings", (payload) => {
      if (!payload || typeof payload !== "object") {
        throw new Error("电量设置无效");
      }
      const updated = manager.updateSettings(payload as Partial<BatterySettings>);
      ctx.tray.refresh();
      return updated;
    });

    ctx.ipc.handle("diagnostics", () => manager.diagnostics());

    ctx.tray.contribute(traySection);
  },

  async start() {
    await manager.start();
  },

  async stop() {
    await manager?.stop();
  },
} satisfies PluginMainModule;
