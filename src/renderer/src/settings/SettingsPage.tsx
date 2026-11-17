import { useState } from "react";
import type { AppSettings, ThemeMode } from "@shared/types";
import { Icon } from "../components/Icon";
import { errorMessage } from "../utils";

function acceleratorFromEvent(event: React.KeyboardEvent): string | null {
  const ignoredKeys = new Set(["Control", "Alt", "Shift", "Meta"]);
  if (ignoredKeys.has(event.key)) {
    return null;
  }
  const modifiers: string[] = [];
  if (event.ctrlKey) {
    modifiers.push("Ctrl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
  }
  if (event.metaKey) {
    modifiers.push("Super");
  }
  if (!modifiers.some((modifier) => modifier !== "Shift")) {
    return null;
  }
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
  return [...modifiers, key].join("+");
}

export function SettingsPage({
  version,
  settings,
  onSettingsChanged,
  notify,
}: {
  version: string;
  settings: AppSettings;
  onSettingsChanged: (settings: AppSettings) => void;
  notify: (message: string, type?: "success" | "error" | "info") => void;
}) {
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [busy, setBusy] = useState(false);

  const update = async (
    patch: Partial<AppSettings>,
    success = "设置已保存",
  ): Promise<void> => {
    setBusy(true);
    try {
      const result = await window.toolbox.updateSettings(patch);
      onSettingsChanged(result.settings);
      if (!result.hotkey.ok) {
        notify(result.hotkey.error ?? "快捷键注册失败", "error");
      } else {
        notify(success);
      }
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  const chooseDirectory = async () => {
    const directory = await window.toolbox.chooseSaveDirectory();
    if (directory) {
      await update({ saveDirectory: directory }, "保存目录已更新");
    }
  };

  return (
    <div className="page-stack settings-page">
      <header className="page-heading">
        <div>
          <h1>系统设置</h1>
          <p>快捷键、保存规则与应用行为。</p>
        </div>
      </header>

      <section className="settings-group">
        <h2 className="settings-group-title">截图</h2>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>全局截图快捷键</strong>
              <p>点击后按下新的组合键。</p>
            </div>
            <button
              className={`hotkey-input ${recordingHotkey ? "recording" : ""}`}
              disabled={busy}
              onFocus={() => setRecordingHotkey(true)}
              onBlur={() => setRecordingHotkey(false)}
              onKeyDown={(event) => {
                event.preventDefault();
                const value = acceleratorFromEvent(event);
                if (value) {
                  setRecordingHotkey(false);
                  event.currentTarget.blur();
                  void update({ hotkey: value }, "快捷键已更新");
                }
              }}
            >
              {recordingHotkey ? "请按下组合键…" : settings.hotkey}
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>保存目录</strong>
              <p>按 Ctrl+S 保存为 PNG。</p>
            </div>
            <button className="directory-button" onClick={() => void chooseDirectory()}>
              <span>{settings.saveDirectory}</span>
              <Icon name="folder" size={15} />
            </button>
          </div>
          <ToggleRow
            title="立即复制"
            description="完成后直接复制，跳过编辑器。"
            checked={settings.autoCopy}
            onChange={(checked) => void update({ autoCopy: checked })}
          />
          <ToggleRow
            title="包含鼠标指针"
            description="在截图中合成当前指针。"
            checked={settings.captureCursor}
            onChange={(checked) => void update({ captureCursor: checked })}
          />
        </div>
      </section>

      <section className="settings-group">
        <h2 className="settings-group-title">应用</h2>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>界面主题</strong>
              <p>主窗口与截图编辑器共用。</p>
            </div>
            <select
              className="select-control"
              value={settings.theme}
              onChange={(event) =>
                void update({ theme: event.target.value as ThemeMode }, "主题已更新")
              }
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </div>
          <ToggleRow
            title="开机自动启动"
            description="登录 Windows 后自动启动到托盘。"
            checked={settings.launchAtLogin}
            onChange={(checked) => void update({ launchAtLogin: checked })}
          />
        </div>
      </section>

      <section className="settings-group">
        <h2 className="settings-group-title">关于</h2>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>独去闲工具箱</strong>
              <p>截图与设置只保存在本机。</p>
            </div>
            <span className="about-version">{version}</span>
          </div>
          <div className="settings-row">
            <div>
              <strong>退出应用</strong>
              <p>关闭窗口后仍会在托盘运行。</p>
            </div>
            <button
              className="action ghost"
              onClick={() => {
                if (window.confirm("确定退出独去闲工具箱？")) {
                  void window.toolbox.quit();
                }
              }}
            >
              退出
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="settings-row toggle-row">
      <span>
        <strong>{title}</strong>
        <p>{description}</p>
      </span>
      <input
        className="switch"
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
