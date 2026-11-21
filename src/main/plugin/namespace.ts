function requiredPart(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes(":")) {
    throw new Error(`${label}无效`);
  }
  return normalized;
}

export function pluginChannel(pluginId: string, channel: string): string {
  return `plugin:${requiredPart(pluginId, "插件 ID")}:${requiredPart(
    channel,
    "插件通道",
  )}`;
}

export function pluginRole(pluginId: string, role: string): string {
  return `plugin:${requiredPart(pluginId, "插件 ID")}:${requiredPart(
    role,
    "窗口角色",
  )}`;
}

export function pluginView(pluginId: string, view: string): string {
  return `${requiredPart(pluginId, "插件 ID")}:${requiredPart(
    view,
    "插件视图",
  )}`;
}

export function pluginMediaSource(
  pluginId: string,
  source: string,
): string {
  return `${requiredPart(pluginId, "插件 ID")}:${requiredPart(
    source,
    "媒体源",
  )}`;
}
