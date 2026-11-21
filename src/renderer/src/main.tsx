import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import {
  PluginErrorBoundary,
  PluginErrorCard,
} from "./components/PluginErrorBoundary";
import {
  loadPluginModules,
  pluginViews,
} from "./plugin/registry";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/pages.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");
document.documentElement.dataset.windowView = view ?? "main";
const root = createRoot(document.getElementById("root")!);

async function boot(): Promise<void> {
  await loadPluginModules();
  const ViewComponent = view ? pluginViews[view] : undefined;
  if (!view) {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
    return;
  }

  const pluginId = view.split(":")[0] || "unknown";
  if (!ViewComponent) {
    root.render(
      <PluginErrorCard
        pluginId={pluginId}
        message="找不到该插件视图，插件可能已被删除或加载失败。"
        onRetry={() => window.location.reload()}
      />,
    );
    return;
  }

  root.render(
    <StrictMode>
      <PluginErrorBoundary pluginId={pluginId}>
        <ViewComponent params={params} />
      </PluginErrorBoundary>
    </StrictMode>,
  );
}

void boot();
