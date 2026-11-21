/** 插件共享元信息：只允许纯数据，禁止 import React 或 Node 模块。 */
export interface PluginMeta {
  /** 必须与插件目录名一致。 */
  id: string;
  /** 导航、托盘与设置区块的排序值，越小越靠前。 */
  order: number;
  /** 侧边栏、顶栏与设置区块标题。 */
  navTitle: string;
}

export type PluginRuntimeState = "loading" | "ready" | "failed";

export interface PluginRuntimeInfo {
  id: string;
  navTitle: string;
  order: number;
  state: PluginRuntimeState;
  error?: string;
}
