import {
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  BatteryCalibrationFrame,
  BatteryDevice,
  BatteryDiagnosticResult,
  BatteryLiveDevice,
  BatterySettings,
} from "@shared/types";
import { Icon } from "../components/Icon";
import { errorMessage } from "../utils";
import "./battery.css";

type BatteryView = "devices" | "discover" | "settings" | "calibrate" | "detail";
type NoticeType = "success" | "error" | "info";
type DeviceEditorState = {
  id: string;
  kind: "name" | "icon";
  value: string;
};

const GAUGE_LENGTH = 2 * Math.PI * 48;

export function BatteryHubPage({
  notify,
}: {
  notify: (message: string, type?: NoticeType) => void;
}) {
  const [view, setView] = useState<BatteryView>("devices");
  const [devices, setDevices] = useState<Record<string, BatteryDevice>>({});
  const [settings, setSettings] = useState<BatterySettings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calibrationDevice, setCalibrationDevice] = useState<BatteryLiveDevice | null>(null);
  const [editor, setEditor] = useState<DeviceEditorState | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  const loadDevices = async () => {
    try {
      setDevices(await window.toolbox.listBatteryDevices());
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const loadSettings = async () => {
    try {
      setSettings(await window.toolbox.getBatterySettings());
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  useEffect(() => {
    void loadDevices();
    void loadSettings();
    const offUpdate = window.toolbox.onBatteryUpdate((device) => {
      setDevices((current) => ({ ...current, [device.id]: device }));
    });
    const offChanged = window.toolbox.onBatteryDevicesChanged(() => {
      void loadDevices();
    });
    return () => {
      offUpdate();
      offChanged();
    };
  }, []);

  const selected = selectedId ? devices[selectedId] : null;
  const visibleDevices = useMemo(() => {
    const list = Object.values(devices).filter((device) => showHidden || !device.hidden);
    return list.sort((a, b) => {
      if (settings?.sortMode === "manual") return (a.order ?? 1e9) - (b.order ?? 1e9);
      return urgencyCompare(a, b);
    });
  }, [devices, settings?.sortMode, showHidden]);
  const hiddenCount = Object.values(devices).filter((device) => device.hidden).length;

  const openDevice = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };

  const showDevices = (id?: string) => {
    setSelectedId(id ?? null);
    setView(id ? "detail" : "devices");
  };

  const update = async (id: string, patch: Partial<BatteryDevice>) => {
    let saved: BatteryDevice;
    if ("customName" in patch) {
      saved = await window.toolbox.renameBatteryDevice(id, patch.customName ?? "");
    } else if ("customIcon" in patch) {
      saved = await window.toolbox.setBatteryDeviceIcon(id, patch.customIcon ?? null);
    } else if ("hidden" in patch) {
      saved = await window.toolbox.setBatteryDeviceHidden(id, !!patch.hidden);
    } else if ("alertThreshold" in patch) {
      saved = await window.toolbox.setBatteryDeviceAlert(
        id,
        typeof patch.alertThreshold === "number" ? patch.alertThreshold : null,
      );
    } else {
      return;
    }
    setDevices((current) => ({ ...current, [id]: saved }));
  };

  const remove = async (device: BatteryDevice) => {
    const name = displayName(device);
    if (!window.confirm(`确定从 Battery Hub 移除“${name}”吗？`)) return;
    try {
      await window.toolbox.removeBatteryDevice(device.id);
      setSelectedId(null);
      setView("devices");
      await loadDevices();
      notify("设备已移除");
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const refresh = async () => {
    setBusy(true);
    try {
      await window.toolbox.pollBatteryDevicesNow();
      await loadDevices();
      notify("外设电量已刷新");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const moveDevice = async (id: string, direction: -1 | 1) => {
    const ids = visibleDevices.map((device) => device.id);
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await window.toolbox.reorderBatteryDevices(ids);
      await loadDevices();
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <div className="battery-hub">
      <aside className="battery-nav">
        <div className="battery-nav-main">
          <div className="battery-device-nav">
            <button
              className={`battery-device-link ${view === "devices" ? "selected" : ""}`}
              onClick={() => showDevices()}
            >
              全部设备 <small>{Object.keys(devices).length}</small>
            </button>
            {visibleDevices.map((device) => (
              <button
                key={device.id}
                className={`battery-device-link ${selectedId === device.id && view === "detail" ? "selected" : ""}`}
                onClick={() => openDevice(device.id)}
              >
                <span className="battery-device-link-name">
                  <span className="battery-device-mini-icon">
                    {device.customIcon || <Icon name={deviceIcon(device)} size={14} />}
                  </span>
                  <span>{displayName(device)}</span>
                </span>
                <small className={capacityTone(device)}>
                  {device.online === false
                    ? "离线"
                    : typeof device.lastReading?.capacity === "number"
                      ? `${device.lastReading.capacity}%`
                      : "…"}
                </small>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <section className="battery-content">
        {(view === "devices" || view === "detail") && (
          <DevicesView
            devices={devices}
            visibleDevices={visibleDevices}
            selected={selected}
            settings={settings}
            hiddenCount={hiddenCount}
            showHidden={showHidden}
            busy={busy}
            onShowHidden={() => setShowHidden((value) => !value)}
            onOpen={openDevice}
            onBack={() => showDevices()}
            onRefresh={refresh}
            onUpdate={update}
            onRemove={remove}
            onMove={moveDevice}
            onAdd={() => setView("discover")}
            onSettings={() => setView("settings")}
            onEdit={(device, kind) => setEditor({
              id: device.id,
              kind,
              value: kind === "name" ? displayName(device) : device.customIcon ?? "",
            })}
            onRecalibrate={(device) => {
              setCalibrationDevice({
                id: device.id,
                product: device.product,
                manufacturer: device.manufacturer,
                channelCount: 0,
                suggestedDriver: device.driverId,
              });
              setView("calibrate");
            }}
            notify={notify}
          />
        )}
        {view === "discover" && (
          <DiscoverView
            notify={notify}
            onAdded={async () => {
              await loadDevices();
              setView("devices");
            }}
            onCalibrate={(device) => {
              setCalibrationDevice(device);
              setView("calibrate");
            }}
            onBack={() => setView("devices")}
          />
        )}
        {view === "calibrate" && calibrationDevice && (
          <CalibrationView
            device={calibrationDevice}
            notify={notify}
            onCancel={() => setView("discover")}
            onSaved={async () => {
              await loadDevices();
              setCalibrationDevice(null);
              setView("devices");
            }}
          />
        )}
        {view === "settings" && settings && (
          <BatterySettingsView
            settings={settings}
            notify={notify}
            onChange={setSettings}
            onBack={() => setView("devices")}
          />
        )}
      </section>
      {editor && devices[editor.id] && (
        <DeviceEditor
          editor={editor}
          device={devices[editor.id]}
          onClose={() => setEditor(null)}
          onSave={async (value) => {
            try {
              await update(
                editor.id,
                editor.kind === "name"
                  ? { customName: value.trim() || null }
                  : { customIcon: value.trim() || null },
              );
              setEditor(null);
              notify(editor.kind === "name" ? "设备名称已更新" : "设备图标已更新");
            } catch (error) {
              notify(errorMessage(error), "error");
            }
          }}
        />
      )}
    </div>
  );
}

function DevicesView({
  devices,
  visibleDevices,
  selected,
  settings,
  hiddenCount,
  showHidden,
  busy,
  onShowHidden,
  onOpen,
  onBack,
  onRefresh,
  onUpdate,
  onRemove,
  onMove,
  onAdd,
  onSettings,
  onEdit,
  onRecalibrate,
  notify,
}: {
  devices: Record<string, BatteryDevice>;
  visibleDevices: BatteryDevice[];
  selected: BatteryDevice | null;
  settings: BatterySettings | null;
  hiddenCount: number;
  showHidden: boolean;
  busy: boolean;
  onShowHidden: () => void;
  onOpen: (id: string) => void;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onUpdate: (id: string, patch: Partial<BatteryDevice>) => Promise<void>;
  onRemove: (device: BatteryDevice) => Promise<void>;
  onMove: (id: string, direction: -1 | 1) => Promise<void>;
  onAdd: () => void;
  onSettings: () => void;
  onEdit: (device: BatteryDevice, kind: "name" | "icon") => void;
  onRecalibrate: (device: BatteryDevice) => void;
  notify: (message: string, type?: NoticeType) => void;
}) {
  if (selected) {
    return (
      <DeviceDetail
        device={selected}
        allDevices={devices}
        settings={settings}
        onBack={onBack}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onRecalibrate={onRecalibrate}
        notify={notify}
      />
    );
  }

  return (
    <div className="battery-page-stack">
      <header className="battery-heading">
        <div>
          <h1>设备</h1>
          <p>集中查看无线鼠标、键盘、耳机和游戏手柄的剩余电量。</p>
        </div>
        <button className="action secondary" disabled={busy} onClick={() => void onRefresh()}>
          <Icon name="repeat" size={15} />
          {busy ? "刷新中…" : "刷新"}
        </button>
      </header>

      {visibleDevices.length > 0 ? (
        <div className={`battery-card-grid ${settings?.density === "compact" ? "compact" : ""}`}>
          {visibleDevices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onOpen={() => onOpen(device.id)}
              onUpdate={onUpdate}
              onRemove={onRemove}
              onMove={onMove}
              onEdit={onEdit}
              manualOrder={settings?.sortMode === "manual"}
              notify={notify}
            />
          ))}
        </div>
      ) : (
        <div className="battery-empty">
          <span><Icon name="battery" size={34} /></span>
          <strong>还没有添加外设</strong>
          <p>进入“添加设备”，连接无线外设后开始记录电量。</p>
        </div>
      )}

      {hiddenCount > 0 && (
        <button className="battery-hidden-link" onClick={onShowHidden}>
          {hiddenCount} 个已隐藏设备 · {showHidden ? "收起" : "显示"}
        </button>
      )}
      <div className="battery-main-actions">
        <button className="action secondary" onClick={onAdd}>
          <Icon name="plus" size={16} />
          添加设备
        </button>
        <button className="action ghost" onClick={onSettings}>
          <Icon name="settings" size={15} />
          Battery Hub 设置
        </button>
      </div>
    </div>
  );
}

function DeviceCard({
  device,
  onOpen,
  onUpdate,
  onRemove,
  onMove,
  onEdit,
  manualOrder,
  notify,
}: {
  device: BatteryDevice;
  onOpen: () => void;
  onUpdate: (id: string, patch: Partial<BatteryDevice>) => Promise<void>;
  onRemove: (device: BatteryDevice) => Promise<void>;
  onMove: (id: string, direction: -1 | 1) => Promise<void>;
  onEdit: (device: BatteryDevice, kind: "name" | "icon") => void;
  manualOrder: boolean;
  notify: (message: string, type?: NoticeType) => void;
}) {
  const capacity = device.lastReading?.capacity;
  const charging = !!device.lastReading?.charging && device.online !== false;
  const offline = device.online === false;
  const tone = offline ? "off" : charging ? "charge" : capacityTone(device);
  const hours = estimateHours(device);

  const run = async (action: () => Promise<void>, message?: string) => {
    try {
      await action();
      if (message) notify(message);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <article
      className={`battery-device-card ${device.hidden ? "is-hidden" : ""}`}
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") onOpen();
      }}
    >
      <div className="battery-card-menu">
        <button
          title="重命名"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(device, "name");
          }}
        >
          改名
        </button>
        <button
          title="更换图标"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(device, "icon");
          }}
        >
          图标
        </button>
        <button
          title={device.hidden ? "显示设备" : "隐藏设备"}
          onClick={(event) => {
            event.stopPropagation();
            void run(
              () => onUpdate(device.id, { hidden: !device.hidden }),
              device.hidden ? "设备已显示" : "设备已隐藏",
            );
          }}
        >
          {device.hidden ? "显示" : "隐藏"}
        </button>
        <button
          className="danger"
          title="移除设备"
          onClick={(event) => {
            event.stopPropagation();
            void onRemove(device);
          }}
        >
          移除
        </button>
        {manualOrder && (
          <>
            <button
              title="上移"
              onClick={(event) => {
                event.stopPropagation();
                void run(() => onMove(device.id, -1));
              }}
            >
              ↑
            </button>
            <button
              title="下移"
              onClick={(event) => {
                event.stopPropagation();
                void run(() => onMove(device.id, 1));
              }}
            >
              ↓
            </button>
          </>
        )}
      </div>

      <BatteryGauge capacity={offline ? null : capacity} tone={tone} charging={charging} />
      <div className="battery-card-title">
        <span className="battery-card-icon">
          {device.customIcon || <Icon name={deviceIcon(device)} size={17} />}
        </span>
        <div>
          <strong>{displayName(device)}</strong>
          <span>{device.manufacturer || "无线外设"}</span>
        </div>
      </div>
      <div className="battery-card-status">
        {offline
          ? device.lastError || "未连接"
          : charging
            ? "正在充电"
            : capacity == null
              ? "等待首次读数"
              : hours
                ? `约 ${formatDuration(hours)} 后耗尽`
                : `更新于 ${timeAgo(device.lastReadingAt)}`}
      </div>
      {typeof capacity === "number" && !offline && (
        <div className="battery-card-track">
          <span className={tone} style={{ width: `${capacity}%` }} />
        </div>
      )}
    </article>
  );
}

function DeviceDetail({
  device,
  allDevices,
  settings,
  onBack,
  onUpdate,
  onRemove,
  onRecalibrate,
  notify,
}: {
  device: BatteryDevice;
  allDevices: Record<string, BatteryDevice>;
  settings: BatterySettings | null;
  onBack: () => void;
  onUpdate: (id: string, patch: Partial<BatteryDevice>) => Promise<void>;
  onRemove: (device: BatteryDevice) => Promise<void>;
  onRecalibrate: (device: BatteryDevice) => void;
  notify: (message: string, type?: NoticeType) => void;
}) {
  const [range, setRange] = useState<"day" | "week">("day");
  const capacity = device.lastReading?.capacity;
  const offline = device.online === false;
  const charging = !!device.lastReading?.charging && !offline;
  const hours = estimateHours(device);
  const rate = drainRate(device.history);
  const customAlert = typeof device.alertThreshold === "number";
  const updateAlert = async (value: number | null) => {
    try {
      await onUpdate(device.id, { alertThreshold: value });
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <div className="battery-page-stack">
      <header className="battery-heading battery-detail-heading">
        <div className="battery-detail-title">
          <button className="icon-action" title="返回全部设备" onClick={onBack}>
            <Icon name="chevron" size={15} style={{ transform: "rotate(180deg)" }} />
          </button>
          <span className="battery-detail-avatar">
            {device.customIcon || <Icon name={deviceIcon(device)} size={22} />}
          </span>
          <div>
            <h1>{displayName(device)}</h1>
            <p>{device.manufacturer || "无线外设"}</p>
          </div>
        </div>
        <div className="heading-actions">
          {device.driverId === "generic" && (
            <button className="action secondary" onClick={() => onRecalibrate(device)}>
              重新校准
            </button>
          )}
          <button className="action danger" onClick={() => void onRemove(device)}>
            移除设备
          </button>
        </div>
      </header>

      <section className="battery-detail-hero">
        <BatteryGauge
          capacity={offline ? null : capacity}
          tone={offline ? "off" : charging ? "charge" : capacityTone(device)}
          charging={charging}
          large
        />
        <div className="battery-detail-summary">
          <div className="battery-detail-status">
            <span className={offline ? "off" : charging ? "charge" : capacityTone(device)}>
              {offline ? "未连接" : charging ? "正在充电" : batteryStatus(device)}
            </span>
            {device.lastError && <small>{device.lastError}</small>}
          </div>
          <div className="battery-facts">
            <Fact label="预计可用" value={charging ? "充电中" : hours ? `约 ${formatDuration(hours)}` : "仍在学习"} />
            <Fact label="耗电速度" value={formatRate(rate)} />
            <Fact label="最后充电" value={lastCharged(device.history)} />
            <Fact label="最后更新" value={timeAgo(device.lastReadingAt)} />
            {typeof device.lastReading?.voltageMv === "number" && (
              <Fact label="电压" value={`${(device.lastReading.voltageMv / 1000).toFixed(2)} V`} />
            )}
          </div>
        </div>
      </section>

      <section className="battery-panel">
        <div className="battery-panel-head">
          <div>
            <strong>电量历史</strong>
            <p>记录变化和充电区间，最多保留 7 天。</p>
          </div>
          <div className="battery-range">
            <button className={range === "day" ? "active" : ""} onClick={() => setRange("day")}>24 小时</button>
            <button className={range === "week" ? "active" : ""} onClick={() => setRange("week")}>7 天</button>
          </div>
        </div>
        <BatteryChart history={device.history} range={range} />
      </section>

      <section className="battery-panel">
        <div className="battery-panel-head">
          <div>
            <strong>低电量提醒</strong>
            <p>
              {customAlert
                ? `此设备低于 ${device.alertThreshold}% 时提醒。`
                : `跟随 Battery Hub 设置，当前为 ${settings?.notifyThreshold ?? 20}%。`}
            </p>
          </div>
          <div className="battery-range">
            <button className={!customAlert ? "active" : ""} onClick={() => void updateAlert(null)}>默认</button>
            <button
              className={customAlert ? "active" : ""}
              onClick={() => void updateAlert(device.alertThreshold ?? settings?.notifyThreshold ?? 20)}
            >
              自定义
            </button>
          </div>
        </div>
        {customAlert && (
          <label className="battery-inline-field">
            <span>提醒阈值</span>
            <input
              type="number"
              min={5}
              max={95}
              step={5}
              value={device.alertThreshold ?? 20}
              onChange={(event) => void updateAlert(Number(event.target.value))}
            />
            <span>%</span>
          </label>
        )}
      </section>
      <p className="battery-data-note">
        当前共管理 {Object.keys(allDevices).length} 个设备；最后一次读取失败次数：
        {device.failedReads ?? 0}。
      </p>
    </div>
  );
}

function DiscoverView({
  notify,
  onAdded,
  onCalibrate,
  onBack,
}: {
  notify: (message: string, type?: NoticeType) => void;
  onAdded: () => Promise<void>;
  onCalibrate: (device: BatteryLiveDevice) => void;
  onBack: () => void;
}) {
  const [candidates, setCandidates] = useState<BatteryLiveDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const scan = async () => {
    setLoading(true);
    try {
      setCandidates(await window.toolbox.listBatteryCandidates());
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void scan();
  }, []);

  const add = async (device: BatteryLiveDevice) => {
    if (!device.suggestedDriver) {
      onCalibrate(device);
      return;
    }
    setBusyId(device.id);
    try {
      await window.toolbox.addBatteryDevice({
        id: device.id,
        driverId: device.suggestedDriver,
        profile: null,
        product: device.product,
        manufacturer: device.manufacturer,
      });
      notify(`${device.product} 已添加`);
      await onAdded();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="battery-page-stack">
      <header className="battery-heading">
        <div>
          <h1>添加设备</h1>
          <p>选择已识别设备直接添加；其他设备可以通过校准读取电量。</p>
        </div>
        <div className="heading-actions">
          <button className="action ghost" onClick={onBack}>返回设备</button>
          <button className="action secondary" disabled={loading} onClick={() => void scan()}>
            <Icon name="repeat" size={15} /> {loading ? "扫描中…" : "重新扫描"}
          </button>
        </div>
      </header>
      {loading ? (
        <div className="battery-empty"><span className="battery-spinner" /><strong>正在扫描外设</strong></div>
      ) : candidates.length ? (
        <div className="battery-candidate-list">
          {candidates.map((device) => (
            <div className="battery-candidate" key={device.id}>
              <span className="battery-candidate-icon"><Icon name={deviceIconFromName(device.product)} size={20} /></span>
              <div>
                <strong>{device.product}</strong>
                <p>{device.manufacturer || "未知厂商"} · {device.channelCount} 个 HID 通道</p>
              </div>
              {device.suggestedDriver ? <span className="battery-supported">已支持</span> : <span className="battery-generic">可校准</span>}
              <button
                className="action primary"
                disabled={busyId === device.id}
                onClick={() => void add(device)}
              >
                {device.suggestedDriver ? "添加" : "开始设置"}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="battery-empty">
          <span><Icon name="search" size={30} /></span>
          <strong>没有发现新设备</strong>
          <p>确认接收器已连接，并打开无线设备的电源。</p>
        </div>
      )}
    </div>
  );
}

function CalibrationView({
  device,
  notify,
  onCancel,
  onSaved,
}: {
  device: BatteryLiveDevice;
  notify: (message: string, type?: NoticeType) => void;
  onCancel: () => void;
  onSaved: () => Promise<void>;
}) {
  const [frames, setFrames] = useState<BatteryCalibrationFrame[]>([]);
  const [scanning, setScanning] = useState(false);
  const [remaining, setRemaining] = useState(30);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [selectedByte, setSelectedByte] = useState<number | null>(null);
  const [passthrough, setPassthrough] = useState(true);
  const [knownPercent, setKnownPercent] = useState(100);
  const [saving, setSaving] = useState(false);

  const scan = async () => {
    setScanning(true);
    setRemaining(30);
    setFrames([]);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setRemaining(Math.max(0, 30 - Math.floor((Date.now() - startedAt) / 1000)));
    }, 250);
    try {
      setFrames(await window.toolbox.captureBatteryCalibration(device.id));
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      clearInterval(timer);
      setScanning(false);
    }
  };

  const save = async () => {
    if (selectedFrame == null || selectedByte == null) return;
    const frame = frames[selectedFrame];
    const raw = frame.bytes[selectedByte];
    const scaleMax = passthrough || knownPercent <= 0
      ? 100
      : Math.round((raw * 100) / knownPercent);
    setSaving(true);
    try {
      await window.toolbox.addBatteryDevice({
        id: device.id,
        driverId: "generic",
        profile: {
          usagePage: frame.usagePage,
          usage: frame.usage,
          reportKind: frame.reportKind,
          reportId: frame.reportId,
          readLength: frame.bytes.length,
          trigger: frame.reportKind === "input" ? Array(frame.bytes.length).fill(0) : null,
          byteOffset: selectedByte,
          scaleMin: 0,
          scaleMax,
        },
        product: device.product,
        manufacturer: device.manufacturer,
      });
      notify(`${device.product} 已添加`);
      await onSaved();
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="battery-page-stack">
      <header className="battery-heading">
        <div>
          <h1>设置 {device.product}</h1>
          <p>扫描期间关闭再打开设备，通常能捕获只在开机时发送的电量报文。</p>
        </div>
        <button className="action ghost" onClick={onCancel}>返回</button>
      </header>

      <section className="battery-panel battery-calibration-step">
        <strong>1. 扫描设备</strong>
        <p>扫描持续 30 秒。请在期间关闭并重新打开外设一到两次。</p>
        {scanning ? (
          <div className="battery-scan-progress">
            <span><span className="battery-spinner" /> 正在监听设备报文</span>
            <strong>{remaining} 秒</strong>
            <div><i style={{ width: `${((30 - remaining) / 30) * 100}%` }} /></div>
          </div>
        ) : (
          <button className="action primary" onClick={() => void scan()}>
            {frames.length ? "重新扫描" : "开始扫描"}
          </button>
        )}
      </section>

      {frames.length > 0 && (
        <section className="battery-panel battery-calibration-step">
          <strong>2. 选择电量值</strong>
          <p>每行是一条设备报文。点击最像当前电量、通常为 0 到 100 的数字。</p>
          <div className="battery-frames">
            {frames.map((frame, frameIndex) => (
              <div className="battery-frame" key={`${frame.reportId}-${frame.hex}`}>
                <div>通道 0x{frame.usagePage.toString(16)} · {frame.reportKind} report {frame.reportId} · 出现 {frame.count} 次</div>
                <div className="battery-bytes">
                  {frame.bytes.map((byte, byteIndex) => (
                    <button
                      key={byteIndex}
                      className={selectedFrame === frameIndex && selectedByte === byteIndex ? "selected" : ""}
                      onClick={() => {
                        setSelectedFrame(frameIndex);
                        setSelectedByte(byteIndex);
                      }}
                    >
                      {byte}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {selectedFrame != null && selectedByte != null && (
        <section className="battery-panel battery-calibration-step">
          <strong>3. 确认</strong>
          <p>已选原始值：<b>{frames[selectedFrame].bytes[selectedByte]}</b></p>
          <label className="battery-check-row">
            <input type="checkbox" checked={passthrough} onChange={(event) => setPassthrough(event.target.checked)} />
            这个数字就是电量百分比
          </label>
          {!passthrough && (
            <label className="battery-inline-field">
              <span>设备实际电量</span>
              <input type="number" min={1} max={100} value={knownPercent} onChange={(event) => setKnownPercent(Number(event.target.value))} />
              <span>%</span>
            </label>
          )}
          <button className="action primary" disabled={saving} onClick={() => void save()}>
            {saving ? "保存中…" : "保存并添加"}
          </button>
        </section>
      )}
    </div>
  );
}

function BatterySettingsView({
  settings,
  notify,
  onChange,
  onBack,
}: {
  settings: BatterySettings;
  notify: (message: string, type?: NoticeType) => void;
  onChange: (settings: BatterySettings) => void;
  onBack: () => void;
}) {
  const [diagnostics, setDiagnostics] = useState<BatteryDiagnosticResult | null>(null);
  const [checking, setChecking] = useState(false);

  const update = async (patch: Partial<BatterySettings>) => {
    try {
      onChange(await window.toolbox.updateBatterySettings(patch));
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const check = async () => {
    setChecking(true);
    try {
      setDiagnostics(await window.toolbox.runBatteryDiagnostics());
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="battery-page-stack battery-settings-page">
      <header className="battery-heading">
        <div>
          <h1>Battery Hub 设置</h1>
          <p>控制电量刷新、提示和托盘显示。</p>
        </div>
        <button className="action ghost" onClick={onBack}>返回设备</button>
      </header>

      <section className="battery-settings-group">
        <h2>显示与刷新</h2>
        <div className="battery-settings-list">
          <SettingRow title="卡片密度" description="详细卡片或更紧凑的网格。">
            <select value={settings.density} onChange={(event) => void update({ density: event.target.value as BatterySettings["density"] })}>
              <option value="detailed">详细</option>
              <option value="compact">紧凑</option>
            </select>
          </SettingRow>
          <SettingRow title="排序方式" description="最紧急优先，或按照手动顺序。">
            <select value={settings.sortMode} onChange={(event) => void update({ sortMode: event.target.value as BatterySettings["sortMode"] })}>
              <option value="urgent">最紧急优先</option>
              <option value="manual">我的顺序</option>
            </select>
          </SettingRow>
          <SettingRow title="刷新间隔" description="可轮询设备重新检查电量的频率。">
            <label className="battery-number-control">
              <input type="number" min={10} max={3600} step={5} value={settings.pollIntervalSec} onChange={(event) => void update({ pollIntervalSec: Number(event.target.value) })} />
              <span>秒</span>
            </label>
          </SettingRow>
          <SettingRow title="工具箱托盘显示电量" description="在现有工具箱托盘中汇总设备状态。">
            <Toggle checked={settings.trayEnabled} onChange={(checked) => void update({ trayEnabled: checked })} />
          </SettingRow>
        </div>
      </section>

      <section className="battery-settings-group">
        <h2>提醒</h2>
        <div className="battery-settings-list">
          <SettingRow title="低电量提醒" description="设备低于阈值时发送 Windows 通知。">
            <Toggle checked={settings.notifyEnabled} onChange={(checked) => void update({ notifyEnabled: checked })} />
          </SettingRow>
          <SettingRow title="默认提醒阈值" description="没有单独设置阈值的设备使用此数值。">
            <label className="battery-number-control">
              <input type="number" min={5} max={95} step={5} value={settings.notifyThreshold} onChange={(event) => void update({ notifyThreshold: Number(event.target.value) })} />
              <span>%</span>
            </label>
          </SettingRow>
          <SettingRow title="开始充电提醒" description="设备开始充电时通知。">
            <Toggle checked={settings.notifyCharging} onChange={(checked) => void update({ notifyCharging: checked })} />
          </SettingRow>
          <SettingRow title="充电完成提醒" description="设备接近满电并停止充电时通知。">
            <Toggle checked={settings.notifyCharged} onChange={(checked) => void update({ notifyCharged: checked })} />
          </SettingRow>
        </div>
      </section>

      <section className="battery-settings-group">
        <h2>检查</h2>
        <div className="battery-settings-list">
          <SettingRow title="运行本地检查" description="检查 HID 工作进程、设备配置和 Windows 电量回退。">
            <button className="action secondary" disabled={checking} onClick={() => void check()}>
              {checking ? "检查中…" : "开始检查"}
            </button>
          </SettingRow>
        </div>
        {diagnostics && (
          <div className="battery-diagnostics">
            <strong className={diagnostics.verdict.tone}>{diagnostics.verdict.title}</strong>
            <p>{diagnostics.verdict.detail}</p>
            {diagnostics.checks.map((checkItem) => (
              <div className="battery-check" key={checkItem.id} data-status={checkItem.status}>
                <span>{checkItem.status === "ok" ? "✓" : checkItem.status === "warn" ? "!" : "×"}</span>
                <div>
                  <strong>{checkItem.title}</strong>
                  <p>{checkItem.detail}</p>
                  {checkItem.fix && <small>{checkItem.fix}</small>}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="battery-data-note">
        外设电量模块基于开源项目 Battery Hub，遵循 MIT 许可证。
      </p>
    </div>
  );
}

function BatteryGauge({
  capacity,
  tone,
  charging,
  large = false,
}: {
  capacity: number | null | undefined;
  tone: string;
  charging: boolean;
  large?: boolean;
}) {
  const value = Math.max(0, Math.min(100, capacity ?? 0));
  const offset = GAUGE_LENGTH - (value / 100) * GAUGE_LENGTH;
  return (
    <div className={`battery-gauge ${large ? "large" : ""} ${tone}`}>
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle className="track" cx="60" cy="60" r="48" />
        <circle
          className="fill"
          cx="60"
          cy="60"
          r="48"
          strokeDasharray={GAUGE_LENGTH}
          strokeDashoffset={capacity == null ? GAUGE_LENGTH : offset}
        />
      </svg>
      <div className="battery-gauge-label">
        {charging && <Icon name="spark" size={large ? 19 : 13} />}
        <strong>{capacity == null ? "—" : `${capacity}%`}</strong>
      </div>
    </div>
  );
}

function DeviceEditor({
  editor,
  device,
  onClose,
  onSave,
}: {
  editor: DeviceEditorState;
  device: BatteryDevice;
  onClose: () => void;
  onSave: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(editor.value);
  const [saving, setSaving] = useState(false);
  const isName = editor.kind === "name";

  return (
    <div
      className="battery-dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="battery-dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          void onSave(value).finally(() => setSaving(false));
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <h2>{isName ? "重命名设备" : "更换设备图标"}</h2>
        <p>
          {isName
            ? `为 ${device.product || "这个外设"} 设置一个容易识别的名称。`
            : "输入一个 emoji，例如 🖱️、⌨️、🎧 或 🎮。"}
        </p>
        <input
          autoFocus
          maxLength={isName ? 40 : 8}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={isName ? "设备名称" : "输入 emoji"}
        />
        <div className="battery-dialog-actions">
          <button type="button" className="action ghost" onClick={onClose}>取消</button>
          <button type="submit" className="action primary" disabled={saving}>
            {saving ? "保存中…" : "保存"}
          </button>
        </div>
      </form>
    </div>
  );
}

function BatteryChart({
  history,
  range,
}: {
  history: BatteryDevice["history"];
  range: "day" | "week";
}) {
  const points = useMemo(() => {
    const span = range === "day" ? 24 * 3600_000 : 7 * 24 * 3600_000;
    const from = Date.now() - span;
    return (history ?? []).filter((point) => point.t >= from);
  }, [history, range]);

  if (points.length < 2) {
    return <div className="battery-chart-empty">这个时间段还没有足够的读数。</div>;
  }
  const width = 720;
  const height = 190;
  const padding = { left: 34, right: 14, top: 12, bottom: 24 };
  const minTime = points[0].t;
  const maxTime = points.at(-1)!.t;
  const timeSpan = Math.max(1, maxTime - minTime);
  const x = (time: number) =>
    padding.left + ((time - minTime) / timeSpan) * (width - padding.left - padding.right);
  const y = (capacity: number) =>
    padding.top + (1 - capacity / 100) * (height - padding.top - padding.bottom);
  const line = points.map((point, index) => `${index ? "L" : "M"}${x(point.t)} ${y(point.c)}`).join(" ");
  const area = `${line} L${x(maxTime)} ${y(0)} L${x(minTime)} ${y(0)} Z`;

  return (
    <svg className="battery-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="设备电量变化图">
      {[0, 50, 100].map((level) => (
        <g key={level}>
          <line x1={padding.left} x2={width - padding.right} y1={y(level)} y2={y(level)} />
          <text x={6} y={y(level) + 4}>{level}%</text>
        </g>
      ))}
      <path className="area" d={area} />
      <path className="line" d={line} />
      {points.at(-1) && <circle cx={x(points.at(-1)!.t)} cy={y(points.at(-1)!.c)} r={4} />}
    </svg>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="battery-setting-row">
      <div><strong>{title}</strong><p>{description}</p></div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <input
      className="switch"
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function displayName(device: BatteryDevice): string {
  return device.customName || device.product || "无线外设";
}

function deviceIcon(device: BatteryDevice): string {
  return deviceIconFromName(`${device.product} ${device.manufacturer}`);
}

function deviceIconFromName(name: string): string {
  if (/headset|耳机|arctis|cloud|maxwell|virtuoso|void/i.test(name)) return "headset";
  if (/controller|dualsense|dualshock|xbox/i.test(name)) return "controller";
  if (/mouse|receiver|鼠标|m7/i.test(name)) return "mouse";
  return "battery";
}

function capacityTone(device: BatteryDevice): "good" | "warn" | "low" | "off" {
  const capacity = device.lastReading?.capacity;
  if (capacity == null) return "off";
  if (capacity <= 20) return "low";
  if (capacity <= 45) return "warn";
  return "good";
}

function batteryStatus(device: BatteryDevice): string {
  const tone = capacityTone(device);
  if (tone === "low") return "电量低";
  if (tone === "warn") return "电量偏低";
  if (tone === "off") return "等待读数";
  return "电量充足";
}

function timeAgo(timestamp: number | null | undefined): string {
  if (!timestamp) return "从未";
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return `${seconds} 秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

function formatDuration(hours: number): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rest = Math.round(hours - days * 24);
    return rest ? `${days} 天 ${rest} 小时` : `${days} 天`;
  }
  if (hours >= 1) return `${Math.round(hours)} 小时`;
  return `${Math.max(5, Math.round(hours * 60))} 分钟`;
}

function drainRate(history: BatteryDevice["history"]): number | null {
  if (!history || history.length < 2) return null;
  let drop = 0;
  let hours = 0;
  for (let index = 1; index < history.length; index += 1) {
    const previous = history[index - 1];
    const current = history[index];
    if (previous.ch || current.ch) continue;
    const diff = previous.c - current.c;
    const elapsed = (current.t - previous.t) / 3_600_000;
    if (diff < -15 || elapsed <= 0 || elapsed > 72) continue;
    drop += diff;
    hours += elapsed;
  }
  return drop >= 2 && hours >= 0.25 ? drop / hours : null;
}

function estimateHours(device: BatteryDevice): number | null {
  const capacity = device.lastReading?.capacity;
  if (capacity == null) return null;
  const rate = drainRate(device.history);
  return rate ? capacity / rate : null;
}

function lastCharged(history: BatteryDevice["history"]): string {
  if (!history) return "未知";
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].ch) return timeAgo(history[index].t);
    if (index > 0 && history[index].c > history[index - 1].c) return timeAgo(history[index].t);
  }
  return "未知";
}

function formatRate(rate: number | null): string {
  if (!rate) return "仍在学习";
  const daily = rate * 24;
  return daily >= 100 ? `${rate.toFixed(1)}% / 小时` : `${daily.toFixed(1)}% / 天`;
}

function urgencyCompare(a: BatteryDevice, b: BatteryDevice): number {
  const rank = (device: BatteryDevice) => {
    if (device.online === false) return 3;
    if (typeof device.lastReading?.capacity !== "number") return 2;
    return device.lastReading.charging ? 1 : 0;
  };
  return rank(a) - rank(b) ||
    (a.lastReading?.capacity ?? 0) - (b.lastReading?.capacity ?? 0) ||
    (a.order ?? 1e9) - (b.order ?? 1e9);
}
