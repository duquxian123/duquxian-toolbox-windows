import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLogSnapshot } from "@shared/types";
import type { Notify } from "../plugin/types";
import { errorMessage } from "../utils";

export function LogViewer({
  onClose,
  notify,
}: {
  onClose: () => void;
  notify: Notify;
}) {
  const [snapshot, setSnapshot] = useState<AppLogSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSnapshot(await window.toolbox.getLogs());
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const lineCount = useMemo(
    () =>
      snapshot?.content
        ? snapshot.content.split("\n").filter(Boolean).length
        : 0,
    [snapshot?.content],
  );

  const copy = async () => {
    if (!snapshot?.content) {
      notify("当前没有可复制的日志", "info");
      return;
    }
    setCopying(true);
    try {
      await navigator.clipboard.writeText(snapshot.content);
      notify("日志已复制到剪贴板");
    } catch (error) {
      notify(errorMessage(error), "error");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div
      className="log-dialog-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="log-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="log-dialog-title"
      >
        <header className="log-dialog-head">
          <div>
            <h2 id="log-dialog-title">运行日志</h2>
            <p>最近 512 KB，日志只保存在本机。</p>
          </div>
          <div className="log-dialog-actions">
            <button
              className="action secondary"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? "读取中…" : "刷新"}
            </button>
            <button
              className="action primary"
              disabled={loading || copying || !snapshot?.content}
              onClick={() => void copy()}
            >
              {copying ? "复制中…" : "复制日志"}
            </button>
            <button className="action ghost" onClick={onClose}>
              关闭
            </button>
          </div>
        </header>

        <div className="log-dialog-meta">
          <span title={snapshot?.filePath}>
            {snapshot?.filePath ?? "正在定位日志文件…"}
          </span>
          <span>
            {lineCount} 行
            {snapshot?.truncated ? " · 仅显示尾部" : " · 已显示全部"}
          </span>
        </div>

        <pre className="log-dialog-content" tabIndex={0} aria-label="运行日志内容">
          {loading && !snapshot
            ? "正在读取日志…"
            : snapshot?.content || "暂无日志"}
        </pre>

        <footer className="log-dialog-foot">
          复制后可直接粘贴到聊天中。日志不会包含截图图像、剪贴板内容或窗口标题。
        </footer>
      </section>
    </div>
  );
}
