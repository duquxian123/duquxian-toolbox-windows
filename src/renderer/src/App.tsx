import { useCallback, useEffect, useState } from "react";
import type { AppSettings } from "@shared/types";
import { Icon } from "./components/Icon";
import { Toast, type Notice } from "./components/Toast";
import { HomePage } from "./home/HomePage";
import { BatteryHubPage } from "./battery/BatteryHubPage";
import { SettingsPage } from "./settings/SettingsPage";
import { errorMessage } from "./utils";

type Workspace = "capture" | "battery" | "settings";

export function App() {
  const [workspace, setWorkspace] = useState<Workspace>("capture");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [version, setVersion] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);

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
        if (bootstrap.hotkeyError) {
          notify(bootstrap.hotkeyError, "error");
        }
      })
      .catch((error) => notify(errorMessage(error), "error"))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [notify]);

  useEffect(() => {
    return window.toolbox.onNavigate((nextSection) => {
      setWorkspace(
        nextSection === "settings"
          ? "settings"
          : nextSection === "battery"
            ? "battery"
            : "capture",
      );
    });
  }, []);

  useEffect(() => {
    return window.toolbox.onHotkeyError((message) => notify(message, "error"));
  }, [notify]);

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

  const startCapture = async (mode: "region" | "repeat" | "fullscreen") => {
    try {
      const result = await window.toolbox.startCapture(mode);
      if (!result.ok) {
        notify(result.error ?? "无法开始截图", "error");
      }
    } catch (error) {
      notify(errorMessage(error), "error");
    }
  };

  if (loading || !settings) {
    return (
      <div className="loading-screen">
        <span className="loading-mark">
          <Icon name="camera" size={24} />
        </span>
        <strong>正在加载</strong>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <nav className="sidebar-tools">
          <NavItem
            active={workspace === "capture"}
            icon="camera"
            label="截图"
            onClick={() => setWorkspace("capture")}
          />
          <NavItem
            active={workspace === "battery"}
            icon="battery"
            label="Battery Hub"
            onClick={() => setWorkspace("battery")}
          />
        </nav>
        <div className="sidebar-footer">
          <NavItem
            active={workspace === "settings"}
            icon="settings"
            label="系统设置"
            onClick={() => setWorkspace("settings")}
          />
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <span className="topbar-tool">
              {workspace === "settings"
                ? "系统设置"
                : workspace === "battery"
                  ? "Battery Hub"
                  : "独去闲工具箱"}
            </span>
          </div>
          <div className="topbar-actions">
            {workspace === "settings" && (
              <button className="action primary" onClick={() => void startCapture("region")}>
                <Icon name="camera" size={16} /> 开始截图
              </button>
            )}
          </div>
        </header>
        <div className="page-content">
          {workspace === "capture" && (
            <HomePage settings={settings} onCapture={startCapture} />
          )}
          {workspace === "battery" && <BatteryHubPage notify={notify} />}
          {workspace === "settings" && (
            <SettingsPage
              version={version}
              settings={settings}
              onSettingsChanged={setSettings}
              notify={notify}
            />
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
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} size={18} />
      <span>{label}</span>
    </button>
  );
}
