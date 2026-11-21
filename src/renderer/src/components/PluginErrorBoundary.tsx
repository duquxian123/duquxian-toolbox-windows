import { Component, type ErrorInfo, type ReactNode } from "react";
import { Icon } from "./Icon";

interface BoundaryProps {
  pluginId: string;
  children: ReactNode;
  compact?: boolean;
}

interface BoundaryState {
  error: string | null;
  resetKey: number;
}

export function PluginErrorCard({
  pluginId,
  message,
  onRetry,
  compact = false,
}: {
  pluginId: string;
  message: string;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div className={`plugin-error-card ${compact ? "compact" : ""}`}>
      <span className="plugin-error-icon">
        <Icon name="spark" size={18} />
      </span>
      <div>
        <strong>插件 {pluginId} 无法运行</strong>
        <p>{message}</p>
      </div>
      <button className="action secondary" onClick={onRetry}>
        重试
      </button>
    </div>
  );
}

export class PluginErrorBoundary extends Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return {
      error: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`插件 ${this.props.pluginId} 渲染失败`, error, info);
  }

  componentDidUpdate(previous: BoundaryProps): void {
    if (previous.pluginId !== this.props.pluginId && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <PluginErrorCard
          pluginId={this.props.pluginId}
          message={this.state.error}
          compact={this.props.compact}
          onRetry={() =>
            this.setState((current) => ({
              error: null,
              resetKey: current.resetKey + 1,
            }))
          }
        />
      );
    }
    return (
      <div key={this.state.resetKey} className="plugin-boundary-content">
        {this.props.children}
      </div>
    );
  }
}
