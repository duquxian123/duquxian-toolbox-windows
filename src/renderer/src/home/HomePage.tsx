import type { AppSettings } from "@shared/types";
import { Icon } from "../components/Icon";

export function HomePage({
  settings,
  onCapture,
}: {
  settings: AppSettings | null;
  onCapture: (mode: "region" | "repeat" | "fullscreen") => Promise<void>;
}) {
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
          <button className="action secondary" onClick={() => void onCapture("repeat")}>
            <Icon name="repeat" size={16} />
            重复上次选区
          </button>
          <button className="action primary" onClick={() => void onCapture("region")}>
            <Icon name="camera" size={16} />
            开始截图
          </button>
        </div>
      </header>

      <div className="quick-grid">
        <button className="quick-card" onClick={() => void onCapture("fullscreen")}>
          <span className="quick-icon">
            <Icon name="monitor" />
          </span>
          <span>
            <strong>当前显示器</strong>
            <small>鼠标所在屏幕</small>
          </span>
          <Icon name="chevron" className="card-chevron" />
        </button>
        <button className="quick-card" onClick={() => void onCapture("repeat")}>
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
    </div>
  );
}
