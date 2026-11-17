# 独去闲工具箱

本地优先的 Windows 截图工具，基于 Electron、React 和 TypeScript。首版聚焦截图完整闭环，不包含旧版静态工具箱中的文本与编码工具。

## 功能

- `Ctrl+Shift+A` 全局截图快捷键，可在设置中修改
- 冻结整个桌面后区域截图、窗口截图和当前显示器全屏截图
- 跨显示器选区与混合 DPI 坐标架构
- 矩形、椭圆、箭头、画笔、文字和马赛克标注
- 撤销、重做、选择和删除标注
- 标注成品复制、原图复制、PNG 保存
- 多个独立置顶贴图窗口
- 鼠标指针可选合成，默认关闭
- 单实例、托盘常驻和可选开机启动
- 自定义 `toolbox://` 协议，正式版不运行本地 HTTP 服务

## 快捷操作

| 操作 | 快捷键 |
| --- | --- |
| 开始截图 | `Ctrl+Shift+A` |
| 复制标注成品 | `Ctrl+C` |
| 保存标注成品 | `Ctrl+S` |
| 复制原图 | `Shift+Ctrl+C` |
| 撤销 | `Ctrl+Z` |
| 重做 | `Shift+Ctrl+Z` |
| 放弃截图 | `Esc` |

选区阶段支持拖动框选、单击窗口和双击当前显示器。托盘菜单提供全屏截图和重复上次选区。

## 开发

要求 Node.js 20 或更高版本。依赖安装使用项目内 `node_modules`，`.npmrc` 已固定兼容依赖解析模式。

```powershell
npm install
npm run dev
```

生产模式预览：

```powershell
npm run build
npm start
```

## 验证与构建

```powershell
npm run typecheck
npm test
npm run test:e2e
npm run package:dir
```

便携版输出目录：

```text
dist\win-unpacked
```

直接运行 `dist\win-unpacked\独去闲工具箱.exe`。当前产物未签名，也未提供安装器或自动更新。

## 数据位置

- 默认永久保存目录：`图片\独去闲工具箱截图`
- 设置、贴图临时文件和未完成会话：Electron 应用数据目录
- 截图与设置均只保存在本机，不上传，也不包含遥测

## 架构

```text
React 渲染进程
  ↕ 受限 preload IPC
Electron 主进程
  ├─ 截图会话与冻结画面
  ├─ 设置和文件写入
  ├─ 托盘、热键与剪贴板
  ├─ Koffi / Win32 窗口适配
  └─ 多贴图窗口
```

渲染进程启用了 `contextIsolation` 和 sandbox，未开启 Node.js 集成。应用资源与媒体文件均通过受控自定义协议读取。

## 已知限制

- DRM 保护画面和部分独占全屏游戏可能无法捕获
- 首版未实现滚动截图、OCR、录屏和截图搜索
- 混合 DPI 的多显示器已有几何测试，但当前实机验收环境只有单显示器
- 自定义系统光标开启后使用可见指针合成，特殊光标样式可能回退为默认箭头
