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

window.addEventListener("error", (event) => {
  void window.toolbox
    .reportLog("error", "渲染器未捕获异常", {
      view,
      message: event.message,
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      error: describeError(event.error),
    })
    .catch(() => undefined);
});

window.addEventListener("unhandledrejection", (event) => {
  void window.toolbox
    .reportLog("error", "渲染器 Promise 未处理拒绝", {
      view,
      error: describeError(event.reason),
    })
    .catch(() => undefined);
});

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

function describeError(error: unknown): unknown {
  return error instanceof Error
    ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      }
    : String(error);
}
