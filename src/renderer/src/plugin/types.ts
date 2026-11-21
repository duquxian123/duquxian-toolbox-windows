import type { ComponentType } from "react";

export type NoticeType = "success" | "error" | "info";
export type Notify = (message: string, type?: NoticeType) => void;

export interface PluginPageProps {
  notify: Notify;
}

export interface PluginRendererModule {
  id: string;
  Icon: ComponentType<{ size?: number }>;
  Page: ComponentType<PluginPageProps>;
  SettingsSection?: ComponentType<PluginPageProps>;
  /** 独立窗口视图，例如截图覆盖层与贴图窗。 */
  views?: Record<string, ComponentType<{ params: URLSearchParams }>>;
}
