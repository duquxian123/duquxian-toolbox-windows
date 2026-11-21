import { useCallback, useEffect, useState } from "react";
import type {
  OrganizerDirectoryKind,
  OrganizerExecuteResult,
  OrganizerPlan,
} from "../shared/types";
import { Icon } from "./icons";
import type { NoticeType } from "../../../renderer/src/plugin/types";
import { errorMessage } from "../../../renderer/src/utils";
import { organizerApi } from "./api";

type Phase = "idle" | "scanning" | "preview" | "executing" | "done";

export function OrganizerPage({
  notify,
}: {
  notify: (message: string, type?: NoticeType) => void;
}) {
  const [sourceDir, setSourceDir] = useState("");
  const [outputDir, setOutputDir] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<OrganizerPlan | null>(null);
  const [result, setResult] = useState<OrganizerExecuteResult | null>(null);

  useEffect(() => {
    let active = true;
    organizerApi
      .getState()
      .then((state) => {
        if (!active) {
          return;
        }
        setSourceDir(state.lastSourceDir ?? "");
        setOutputDir(state.lastOutputDir ?? "");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const chooseDirectory = useCallback(
    async (kind: OrganizerDirectoryKind) => {
      try {
        const chosen = await organizerApi.chooseDirectory(kind);
        if (!chosen) {
          return;
        }
        if (kind === "source") {
          setSourceDir(chosen);
        } else {
          setOutputDir(chosen);
        }
        setPlan(null);
        setResult(null);
        setPhase("idle");
      } catch (error) {
        notify(errorMessage(error), "error");
      }
    },
    [notify],
  );

  const scan = useCallback(async () => {
    setPhase("scanning");
    setResult(null);
    try {
      const nextPlan = await organizerApi.scan(sourceDir, outputDir);
      setPlan(nextPlan);
      setPhase("preview");
      if (nextPlan.items.length === 0) {
        notify("源文件夹中没有可整理的照片或视频", "error");
      }
    } catch (error) {
      setPhase("idle");
      notify(errorMessage(error), "error");
    }
  }, [sourceDir, outputDir, notify]);

  const execute = useCallback(async () => {
    setPhase("executing");
    try {
      const executeResult = await organizerApi.execute(
        sourceDir,
        outputDir,
      );
      setResult(executeResult);
      setPlan(null);
      setPhase("done");
      if (executeResult.failed.length === 0) {
        notify(`整理完成，已移动 ${executeResult.moved} 个文件`);
      } else {
        notify(
          `已移动 ${executeResult.moved} 个，失败 ${executeResult.failed.length} 个`,
          "error",
        );
      }
    } catch (error) {
      setPhase("preview");
      notify(errorMessage(error), "error");
    }
  }, [sourceDir, outputDir, notify]);

  const busy = phase === "scanning" || phase === "executing";
  const canScan = Boolean(sourceDir && outputDir) && !busy;

  return (
    <div className="page-stack organizer-page">
      <header className="page-heading">
        <div>
          <h1>媒体整理</h1>
          <p>按拍摄时间把照片和视频移动到输出文件夹的年份子目录，并重命名为年月日。</p>
        </div>
        <div className="heading-actions">
          <button
            className="action primary"
            disabled={!canScan}
            onClick={() => void scan()}
          >
            <Icon name="search" size={16} />
            {phase === "scanning" ? "正在扫描…" : "生成预览"}
          </button>
        </div>
      </header>

      <div className="organizer-folders">
        <FolderCard
          icon="folder-in"
          label="待整理文件夹"
          hint="手机拷贝来的照片和视频"
          path={sourceDir}
          onChoose={() => void chooseDirectory("source")}
        />
        <FolderCard
          icon="folder-out"
          label="输出文件夹"
          hint="按年份分类存放，如 2024、2025"
          path={outputDir}
          onChoose={() => void chooseDirectory("output")}
        />
      </div>

      {(phase === "preview" || phase === "executing") && plan && (
        <section className="organizer-preview">
          <div className="organizer-summary">
            <span>
              共 <strong>{plan.items.length}</strong> 个媒体文件
            </span>
            {plan.skippedNonMedia > 0 && (
              <span className="organizer-summary-skip">
                已跳过非媒体文件 {plan.skippedNonMedia} 个
              </span>
            )}
          </div>
          {plan.items.length > 0 && (
            <>
              <div className="organizer-table-wrap">
                <table className="organizer-table">
                  <thead>
                    <tr>
                      <th>原文件名</th>
                      <th>时间</th>
                      <th>来源</th>
                      <th>目标位置</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.items.map((item) => (
                      <tr key={item.sourcePath}>
                        <td className="organizer-cell-name" title={item.fileName}>
                          {item.fileName}
                        </td>
                        <td className="organizer-cell-time">
                          {formatDateTime(item.takenAt)}
                        </td>
                        <td>
                          <span
                            className={`organizer-tag ${
                              item.timeSource === "captured" ? "captured" : "file"
                            }`}
                          >
                            {item.timeSource === "captured" ? "拍摄时间" : "文件时间"}
                          </span>
                        </td>
                        <td className="organizer-cell-target" title={item.targetPath}>
                          {item.year}\{item.targetName}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="organizer-confirm">
                <p className="organizer-warning">
                  确认后文件将被移动到输出文件夹，此操作不可撤销。
                </p>
                <button
                  className="action primary large"
                  disabled={busy}
                  onClick={() => void execute()}
                >
                  <Icon name="check" size={16} />
                  {phase === "executing"
                    ? "正在整理…"
                    : `确认整理（移动 ${plan.items.length} 个文件）`}
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {phase === "done" && result && (
        <section className="organizer-result">
          <div className="organizer-result-card">
            <strong>整理完成</strong>
            <p>
              成功移动 {result.moved} 个文件
              {result.failed.length > 0 && `，失败 ${result.failed.length} 个`}
              {result.skippedNonMedia > 0 &&
                `，跳过非媒体文件 ${result.skippedNonMedia} 个`}
              。
            </p>
          </div>
          {result.failed.length > 0 && (
            <div className="organizer-failures">
              {result.failed.map((failure) => (
                <div className="organizer-failure" key={failure.fileName}>
                  <span className="organizer-cell-name">{failure.fileName}</span>
                  <span className="organizer-failure-reason">{failure.error}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FolderCard({
  icon,
  label,
  hint,
  path,
  onChoose,
}: {
  icon: string;
  label: string;
  hint: string;
  path: string;
  onChoose: () => void;
}) {
  return (
    <div className="organizer-folder">
      <span className="quick-icon">
        <Icon name={icon} />
      </span>
      <span className="organizer-folder-info">
        <strong>{label}</strong>
        <small title={path}>{path || hint}</small>
      </span>
      <button className="action secondary" onClick={onChoose}>
        选择
      </button>
    </div>
  );
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
