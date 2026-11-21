import { useEffect, useState } from "react";
import type { Notify } from "../../../renderer/src/plugin/types";
import { errorMessage } from "../../../renderer/src/utils";
import type { CaptureSettings } from "../shared/types";
import { captureApi } from "./api";
import { Icon } from "./icons";

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

interface HotkeyFeedback {
  tone: "error" | "success";
  message: string;
  suggestions: string[];
}

export function CaptureSettingsSection({
  notify,
  onSettingsChange,
}: {
  notify: Notify;
  onSettingsChange?: (settings: CaptureSettings) => void;
}) {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [recordingHotkey, setRecordingHotkey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hotkeyFeedback, setHotkeyFeedback] = useState<HotkeyFeedback | null>(
    null,
  );

  const applySettings = (next: CaptureSettings) => {
    setSettings(next);
    onSettingsChange?.(next);
  };

  useEffect(() => {
    let active = true;
    void captureApi
      .getSettings()
      .then((next) => {
        if (active) {
          setSettings(next);
        }
      })
      .catch((error) => notify(errorMessage(error), "error"));
    return () => {
      active = false;
    };
  }, [notify]);

  const update = async (
    patch: Partial<CaptureSettings>,
    success = "设置已保存",
  ): Promise<void> => {
    setBusy(true);
    try {
      const result = await captureApi.updateSettings(patch);
      applySettings(result.settings);
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

  if (!settings) {
    return null;
  }

  const chooseDirectory = async () => {
    const directory = await captureApi.chooseSaveDirectory();
    if (directory) {
      await update({ saveDirectory: directory }, "保存目录已更新");
    }
  };

  const applyHotkey = async (value: string): Promise<void> => {
    setBusy(true);
    try {
      const check = await captureApi.checkHotkey(value);
      if (!check.ok) {
        setHotkeyFeedback({
          tone: "error",
          message: check.error ?? `快捷键 ${value} 不可用`,
          suggestions: check.suggestions,
        });
        return;
      }
      const result = await captureApi.updateSettings({
        hotkey: value,
      });
      applySettings(result.settings);
      if (!result.hotkey.ok) {
        setHotkeyFeedback({
          tone: "error",
          message: result.hotkey.error ?? "快捷键注册失败",
          suggestions: result.hotkey.suggestions,
        });
        return;
      }
      setHotkeyFeedback(null);
      notify("快捷键已更新");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-group">
      <h2 className="settings-group-title">截图设置</h2>
      <div className="settings-list">
        <div className="settings-row">
          <div>
            <strong>全局截图快捷键</strong>
            <p>点击后按下新的组合键，保存前会检测是否被占用。</p>
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
                void applyHotkey(value);
              }
            }}
          >
            {recordingHotkey ? "请按下组合键…" : settings.hotkey}
          </button>
        </div>
        {hotkeyFeedback ? (
          <div
            className={`hotkey-feedback ${hotkeyFeedback.tone}`}
            role={hotkeyFeedback.tone === "error" ? "alert" : "status"}
          >
            <p>{hotkeyFeedback.message}</p>
            {hotkeyFeedback.suggestions.length > 0 ? (
              <div className="hotkey-suggestions">
                <span>可用组合</span>
                {hotkeyFeedback.suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={busy}
                    onClick={() => void applyHotkey(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
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
