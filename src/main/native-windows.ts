import { screen } from "electron";
import koffi from "koffi";
import type { Point, Rectangle, WindowTarget } from "../shared/types";

interface NativeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface NativePoint {
  x: number;
  y: number;
}

interface NativeCursorInfo {
  cbSize: number;
  flags: number;
  hCursor: bigint | null;
  ptScreenPos: NativePoint;
}

const GWL_EXSTYLE = -20;
const WS_EX_TOOLWINDOW = 0x00000080;
const DWMWA_EXTENDED_FRAME_BOUNDS = 9;
const DWMWA_CLOAKED = 14;

const user32 = koffi.load("user32.dll");
const dwmapi = koffi.load("dwmapi.dll");

const RECT = koffi.struct("RECT", {
  left: "long",
  top: "long",
  right: "long",
  bottom: "long",
});

const POINT = koffi.struct("POINT", {
  x: "long",
  y: "long",
});

const CURSORINFO = koffi.struct("CURSORINFO", {
  cbSize: "uint32_t",
  flags: "uint32_t",
  hCursor: "void *",
  ptScreenPos: POINT,
});

const EnumWindowsProc = koffi.proto(
  "bool __stdcall EnumWindowsProc(void *hwnd, intptr_t lParam)",
);

const EnumWindows = user32.func(
  "bool __stdcall EnumWindows(EnumWindowsProc *callback, intptr_t lParam)",
);
const IsWindowVisible = user32.func("bool __stdcall IsWindowVisible(void *hwnd)");
const IsIconic = user32.func("bool __stdcall IsIconic(void *hwnd)");
const GetWindowRect = user32.func(
  "bool __stdcall GetWindowRect(void *hwnd, _Out_ RECT *rect)",
);
const GetWindowTextW = user32.func(
  "int __stdcall GetWindowTextW(void *hwnd, _Out_ uint16_t *text, int maxCount)",
);
const GetWindowThreadProcessId = user32.func(
  "uint32_t __stdcall GetWindowThreadProcessId(void *hwnd, _Out_ uint32_t *pid)",
);
const GetWindowLongW = user32.func(
  "long __stdcall GetWindowLongW(void *hwnd, int index)",
);
const WindowFromPoint = user32.func(
  "void *__stdcall WindowFromPoint(POINT point)",
);
const GetAncestor = user32.func(
  "void *__stdcall GetAncestor(void *hwnd, uint32_t flags)",
);
const GetCursorInfo = user32.func(
  "bool __stdcall GetCursorInfo(_Inout_ CURSORINFO *cursorInfo)",
);
const DwmGetWindowAttributeRect = dwmapi.func(
  "long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attribute, _Out_ RECT *value, uint32_t size)",
);
const DwmGetWindowAttributeInt = dwmapi.func(
  "long __stdcall DwmGetWindowAttribute(void *hwnd, uint32_t attribute, _Out_ int *value, uint32_t size)",
);

function toElectronPoint(point: NativePoint): Point {
  return screen.screenToDipPoint({ x: point.x, y: point.y });
}

function toElectronRect(rect: NativeRect): Rectangle {
  const topLeft = screen.screenToDipPoint({ x: rect.left, y: rect.top });
  const bottomRight = screen.screenToDipPoint({ x: rect.right, y: rect.bottom });
  return {
    x: Math.round(topLeft.x),
    y: Math.round(topLeft.y),
    width: Math.max(0, Math.round(bottomRight.x - topLeft.x)),
    height: Math.max(0, Math.round(bottomRight.y - topLeft.y)),
  };
}

function readWindowTitle(hwnd: bigint): string {
  const buffer = Buffer.alloc(1024 * 2);
  const length = GetWindowTextW(hwnd, buffer, 1024);
  if (!length) {
    return "";
  }
  return buffer.toString("utf16le", 0, length * 2).replace(/\0+$/, "").trim();
}

function readWindowRect(hwnd: bigint): NativeRect | null {
  const rect: NativeRect = { left: 0, top: 0, right: 0, bottom: 0 };
  if (DwmGetWindowAttributeRect(
    hwnd,
    DWMWA_EXTENDED_FRAME_BOUNDS,
    rect,
    koffi.sizeof(RECT),
  ) !== 0 && !GetWindowRect(hwnd, rect)) {
    return null;
  }
  if (rect.right <= rect.left || rect.bottom <= rect.top) {
    return null;
  }
  return rect;
}

function isWindowCloaked(hwnd: bigint): boolean {
  const cloaked = [0];
  const result = DwmGetWindowAttributeInt(hwnd, DWMWA_CLOAKED, cloaked, 4);
  return result === 0 && Boolean(cloaked[0]);
}

function isEligibleWindow(hwnd: bigint): boolean {
  if (!hwnd || !IsWindowVisible(hwnd) || IsIconic(hwnd) || isWindowCloaked(hwnd)) {
    return false;
  }
  const extendedStyle = GetWindowLongW(hwnd, GWL_EXSTYLE);
  if ((extendedStyle & WS_EX_TOOLWINDOW) !== 0) {
    return false;
  }
  const processId = [0];
  GetWindowThreadProcessId(hwnd, processId);
  return processId[0] !== process.pid;
}

function describeWindow(hwnd: bigint): WindowTarget | null {
  if (!isEligibleWindow(hwnd)) {
    return null;
  }
  const title = readWindowTitle(hwnd);
  const nativeRect = readWindowRect(hwnd);
  if (!title || !nativeRect) {
    return null;
  }
  const bounds = toElectronRect(nativeRect);
  if (bounds.width < 2 || bounds.height < 2) {
    return null;
  }
  return {
    id: hwnd.toString(),
    title,
    globalBounds: bounds,
    localBounds: bounds,
  };
}

export class NativeWindows {
  static available(): boolean {
    return process.platform === "win32";
  }

  listTopLevelWindows(): WindowTarget[] {
    if (!NativeWindows.available()) {
      return [];
    }
    const windows: WindowTarget[] = [];
    EnumWindows((hwnd: bigint | null) => {
      if (!hwnd) {
        return true;
      }
      try {
        const window = describeWindow(hwnd);
        if (window) {
          windows.push(window);
        }
      } catch (error) {
        console.warn("读取窗口信息失败", error);
      }
      return true;
    }, 0);
    return windows;
  }

  windowAtPoint(point: Point): WindowTarget | null {
    if (!NativeWindows.available()) {
      return null;
    }
    const physicalPoint = screen.dipToScreenPoint(point);
    const child = WindowFromPoint({
      x: Math.round(physicalPoint.x),
      y: Math.round(physicalPoint.y),
    });
    if (!child) {
      return null;
    }
    const root = GetAncestor(child, 2) ?? child;
    return describeWindow(root);
  }

  cursorVisible(): boolean {
    if (!NativeWindows.available()) {
      return true;
    }
    const info: NativeCursorInfo = {
      cbSize: koffi.sizeof(CURSORINFO),
      flags: 0,
      hCursor: null,
      ptScreenPos: { x: 0, y: 0 },
    };
    return GetCursorInfo(info) ? (info.flags & 0x00000001) !== 0 : true;
  }
}

