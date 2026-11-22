# 独去闲工具箱

本地优先的 Windows 截图与外设电量工具箱，基于 Electron、React 和 TypeScript。

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
- Battery Hub 外设电量模块，支持无线鼠标、键盘、耳机和游戏手柄
- JZ M7、GameSir 启明星2、罗技、雷蛇、PlayStation、SteelSeries、HyperX、Corsair、Audeze 等设备协议
- GameSir Nova 2 Lite（启明星2）使用直接 HID 查询，不要求 GameSir Connect 安装或运行
- 未识别设备可通过 30 秒报文扫描进行校准
- 24 小时/7 天电量历史、剩余时间估算、低电量与充电通知
- 工具箱共用托盘汇总外设电量，不额外创建每设备托盘图标
- 设备改名、自定义图标、隐藏、移除、手动排序和每设备提醒阈值
- Battery Hub 内部导航把设备列表与添加设备、模块设置分开显示
- 窄窗口下设备列表自动移动到内容上方，避免侧栏与卡片重叠

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

开发启动前会自动构建 Windows 蓝牙/Xbox 电量辅助程序。需要单独构建时：

```powershell
npm run battery:build
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

Electron 应用运行时必须保留 `win-unpacked` 整个文件夹，不能只复制其中的 EXE。

## 数据位置

- 默认永久保存目录：`图片\独去闲工具箱截图`
- 设置、贴图临时文件和未完成会话：Electron 应用数据目录
- 诊断日志：Electron 应用数据目录下的 `logs\toolbox.log`
- Battery Hub 数据：Electron 应用数据目录下的 `battery-hub.json`
- 首次启用电量模块时只从原 Battery Hub 迁移设备配置，不迁移历史与模块设置
- GameSir 启明星2直接通过本机 HID 查询，不读取或依赖官方软件日志
- 截图、设置与电量数据均只保存在本机，不上传，也不包含遥测

日志每个文件最多 2 MB，最多保留 5 个历史文件。日志用于记录启动、插件、
快捷键和截图流程的异常，不记录截图图像、剪贴板内容或其他软件的窗口标题。
在“系统设置 > 诊断 > 运行日志”中可查看最近 512 KB 日志并一键复制。
Battery Hub 会记录每次电量读取、HID 原始电池报文、解码结果和读取失败。

## 第三方来源

外设电量模块基于 [Battery Hub](https://github.com/battery-hub/battery-hub)，遵循 MIT 许可证。许可证和来源说明见 `THIRD_PARTY_NOTICES.md` 与 `licenses/`。

## 架构

```text
React 渲染进程
  ↕ 受限 preload IPC
Electron 主进程
  ├─ 截图会话与冻结画面
  ├─ Battery Hub 电量轮询、历史与通知
  ├─ 独立 node-hid 工作进程和设备驱动
  ├─ HID 驱动：JZ M7、GameSir Nova 2 Lite、Logitech、Razer、Sony 等
  ├─ Windows 蓝牙与 Xbox 电量辅助程序
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
- 部分第三方 Xbox 360 兼容接收器对 Windows 暴露为有线控制器，可能不提供标准电量
- 未识别设备需要校准，但仍有少数设备会隐藏或拒绝公开电量查询
