import { useCallback, useEffect, useState } from "react";
import type { PluginRuntimeInfo } from "@shared/plugin";
import type { CoreSettings } from "@shared/types";
import { Icon } from "./components/Icon";
import {
  PluginErrorBoundary,
  PluginErrorCard,
} from "./components/PluginErrorBoundary";
import { Toast, type Notice } from "./components/Toast";
import { pluginLoadErrors, plugins } from "./plugin/registry";
import type { PluginRendererModule } from "./plugin/types";
import { SettingsPage } from "./settings/SettingsPage";
import { errorMessage } from "./utils";

export function App() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [settings, setSettings] = useState<CoreSettings | null>(null);
  const [runtimePlugins, setRuntimePlugins] = useState<PluginRuntimeInfo[]>(
    [],
  );
  const [version, setVersion] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState<string | null>(null);

  const notify = useCallback(
    (message: string, type: Notice["type"] = "success") => {
      setNotice({ id: Date.now(), message, type });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    void window.toolbox
      .getBootstrap()
      .then((bootstrap) => {
        if (!active) {
          return;
        }
        setSettings(bootstrap.settings);
        setVersion(bootstrap.version);
        setRuntimePlugins(bootstrap.plugins);
        setActiveId((current) => current ?? bootstrap.plugins[0]?.id ?? null);
      })
      .catch((error) => {
        setStartupError(errorMessage(error));
        notify(errorMessage(error), "error");
      })
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(
    () =>
      window.toolbox.onPluginStatusChanged((next) => {
        setRuntimePlugins(next);
        setActiveId((current) => current ?? next[0]?.id ?? null);
      }),
    [],
  );

  useEffect(() => {
    return window.toolbox.onNavigate((nextSection) => {
      if (nextSection === "settings") {
        setActiveId("settings");
        return;
      }
      if (runtimePlugins.some((plugin) => plugin.id === nextSection)) {
        setActiveId(nextSection);
      }
    });
  }, [runtimePlugins]);

  useEffect(() => {
    if (!settings) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme =
        settings.theme === "system" ? (media.matches ? "dark" : "light") : settings.theme;
      document.documentElement.dataset.theme = theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings]);

  if (loading || (!settings && !startupError)) {
    return (
      <div className="loading-screen">
        <span className="loading-mark">
          <Icon name="spark" size={24} />
        </span>
        <strong>正在加载</strong>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="loading-screen">
        <Icon name="spark" size={24} />
        <strong>应用启动失败</strong>
        <span>{startupError}</span>
      </div>
    );
  }

  const modules = new Map(
    plugins.map((plugin) => [plugin.id, plugin] as const),
  );
  const entries = runtimePlugins.map((info) => ({
    ...info,
    module: modules.get(info.id),
  }));
  const activePlugin = entries.find((plugin) => plugin.id === activeId) ?? null;
  const activeModule = activePlugin?.module;
  const showingSettings = activeId === "settings";
  const ActivePage = activeModule?.Page;
  const activeError =
    activePlugin?.error ||
    (activePlugin ? pluginLoadErrors.get(activePlugin.id) : null);

  return (
    <div className="app-shell">
        <aside className="sidebar">
          <nav className="sidebar-tools">
            {entries.map((plugin) => {
              const IconComponent = plugin.module?.Icon;
              return (
              <NavItem
                key={plugin.id}
                active={activeId === plugin.id}
                icon={
                  IconComponent ? (
                    <IconComponent size={18} />
                  ) : (
                    <Icon name="spark" size={18} />
                  )
                }
                label={plugin.navTitle}
                onClick={() => setActiveId(plugin.id)}
              />
              );
            })}
          </nav>
          <div className="sidebar-footer">
            <NavItem
              active={showingSettings}
              icon={<Icon name="settings" size={18} />}
              label="系统设置"
              onClick={() => setActiveId("settings")}
            />
          </div>
        </aside>

        <main className="main-panel">
          <header className="topbar">
            <div className="topbar-title">
              <span className="topbar-tool">
                {showingSettings ? "系统设置" : (activePlugin?.navTitle ?? "独去闲工具箱")}
              </span>
            </div>
          </header>
          <div className="page-content">
            {showingSettings && (
              <SettingsPage
                version={version}
                settings={settings}
                onSettingsChanged={setSettings}
                notify={notify}
                pluginSections={entries.flatMap((plugin) =>
                  plugin.state === "ready" &&
                  plugin.module?.SettingsSection
                    ? [
                        {
                          id: plugin.id,
                          label: plugin.navTitle,
                          Section: plugin.module.SettingsSection,
                        },
                      ]
                    : [],
                )}
              />
            )}
            {!showingSettings && activePlugin?.state === "failed" && (
              <PluginErrorCard
                pluginId={activePlugin.id}
                message={activeError ?? "插件初始化失败"}
                onRetry={() => window.location.reload()}
              />
            )}
            {!showingSettings && activePlugin?.state === "loading" && (
              <div className="plugin-loading-card">
                <Icon name="spark" size={18} />
                <span>正在加载 {activePlugin.navTitle}…</span>
              </div>
            )}
            {!showingSettings &&
              activePlugin?.state === "ready" &&
              ActivePage && (
                <PluginErrorBoundary pluginId={activePlugin.id}>
                  <ActivePage notify={notify} />
                </PluginErrorBoundary>
              )}
            {!showingSettings &&
              activePlugin?.state === "ready" &&
              !ActivePage && (
                <PluginErrorCard
                  pluginId={activePlugin.id}
                  message={
                    activeError ?? "插件渲染入口未加载，或缺少页面导出。"
                  }
                  onRetry={() => window.location.reload()}
                />
              )}
            {!showingSettings && !activePlugin && entries.length > 0 && (
              <div className="plugin-loading-card">
                <span>请选择一个插件</span>
              </div>
            )}
            {!showingSettings && entries.length === 0 && (
              <div className="page-stack">
                <header className="page-heading">
                  <div>
                    <h1>未安装插件</h1>
                    <p>把插件目录放到 src/plugins 下即可显示在这里。</p>
                  </div>
                </header>
              </div>
            )}
          </div>
        </main>
        <Toast notice={notice} onClose={() => setNotice(null)} />
    </div>
  );
}

function NavItem({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
