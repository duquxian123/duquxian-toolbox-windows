import { useEffect, useState } from "react";
import type { Notify } from "../../../renderer/src/plugin/types";
import { errorMessage } from "../../../renderer/src/utils";
import type { CaptureMode, CaptureSettings } from "../shared/types";
import { captureApi } from "./api";
import { CaptureSettingsSection } from "./CaptureSettingsSection";
import { Icon } from "./icons";

export function HomePage({ notify }: { notify: Notify }) {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);

  useEffect(() => {
    let active = true;
    void captureApi
      .getStatus()
      .then((status) => {
        if (active && status.hotkeyError) {
          notify(status.hotkeyError, "error");
        }
      })
      .catch(() => undefined);
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

  const startCapture = async (mode: CaptureMode) => {
    try {
      const result = await captureApi.start(mode);
      if (!result.ok) {
        notify(result.error ?? "无法开始截图", "error");
      }
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  const hotkey = settings?.hotkey ?? "Ctrl+Shift+A";

  return (
    <div className="page-stack">
      <header className="page-heading">
        <div>
          <h1>截图</h1>
          <p>框选、标注并复制或保存，所有处理都在本机完成。</p>
        </div>
        <div className="heading-actions">
          <span className="heading-shortcut">
            <kbd>{hotkey}</kbd>
          </span>
          <button
            className="action secondary"
            onClick={() => void startCapture("repeat")}
          >
            <Icon name="repeat" size={16} />
            重复上次选区
          </button>
          <button className="action primary" onClick={() => void startCapture("region")}>
            <Icon name="camera" size={16} />
            开始截图
          </button>
        </div>
      </header>

      <div className="quick-grid">
        <button className="quick-card" onClick={() => void startCapture("fullscreen")}>
          <span className="quick-icon">
            <Icon name="monitor" />
          </span>
          <span>
            <strong>当前显示器</strong>
            <small>鼠标所在屏幕</small>
          </span>
          <Icon name="chevron" className="card-chevron" />
        </button>
        <button className="quick-card" onClick={() => void startCapture("repeat")}>
          <span className="quick-icon">
            <Icon name="repeat" />
          </span>
          <span>
            <strong>上次选区</strong>
            <small>沿用最近范围</small>
          </span>
          <Icon name="chevron" className="card-chevron" />
        </button>
      </div>

      <CaptureSettingsSection notify={notify} onSettingsChange={setSettings} />
    </div>
  );
}
