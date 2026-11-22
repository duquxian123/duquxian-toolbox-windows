import { useState, type ComponentType } from "react";
import type { CoreSettings, ThemeMode } from "@shared/types";
import { PluginErrorBoundary } from "../components/PluginErrorBoundary";
import type { Notify, PluginPageProps } from "../plugin/types";
import { errorMessage } from "../utils";
import { LogViewer } from "./LogViewer";

export function SettingsPage({
  version,
  settings,
  onSettingsChanged,
  notify,
  pluginSections,
}: {
  version: string;
  settings: CoreSettings;
  onSettingsChanged: (settings: CoreSettings) => void;
  notify: Notify;
  pluginSections: Array<{
    id: string;
    label: string;
    Section: ComponentType<PluginPageProps>;
  }>;
}) {
  const [logsOpen, setLogsOpen] = useState(false);

  const update = async (
    patch: Partial<CoreSettings>,
    success = "设置已保存",
  ): Promise<void> => {
    try {
      const updated = await window.toolbox.updateSettings(patch);
      onSettingsChanged(updated);
      notify(success);
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  return (
    <div className="page-stack settings-page">
      <header className="page-heading">
        <div>
          <h1>系统设置</h1>
          <p>主题、应用行为与各插件配置。</p>
        </div>
      </header>

      <section className="settings-group">
        <h2 className="settings-group-title">应用</h2>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>界面主题</strong>
              <p>主窗口与所有插件窗口共用。</p>
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
        <h2 className="settings-group-title">诊断</h2>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>运行日志</strong>
              <p>在界面查看最近日志，并一键复制发给开发者。</p>
            </div>
            <button
              className="action secondary"
              onClick={() => setLogsOpen(true)}
            >
              查看日志
            </button>
          </div>
        </div>
      </section>

      {pluginSections.map((plugin) => {
        const Section = plugin.Section;
        return (
          <PluginErrorBoundary
            key={plugin.id}
            pluginId={plugin.id}
            compact
          >
            <Section notify={notify} />
          </PluginErrorBoundary>
        );
      })}

      <section className="settings-group">
        <h2 className="settings-group-title">关于</h2>
        <div className="settings-list">
          <div className="settings-row">
            <div>
              <strong>独去闲工具箱</strong>
              <p>所有数据只保存在本机。</p>
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

      {logsOpen && (
        <LogViewer
          notify={notify}
          onClose={() => setLogsOpen(false)}
        />
      )}
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
