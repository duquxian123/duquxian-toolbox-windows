import type {
  BatteryAddRequest,
  BatteryCalibrationFrame,
  BatteryDevice,
  BatteryDiagnosticResult,
  BatteryLiveDevice,
  BatterySettings,
} from "./battery-types";

export * from "./battery-types";

export interface Point {
  x: number;
  y: number;
}

export interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DisplaySnapshot {
  id: string;
  label: string;
  globalBounds: Rectangle;
  localBounds: Rectangle;
  scaleFactor: number;
  imageUrl: string;
  pixelWidth: number;
  pixelHeight: number;
}

export interface WindowTarget {
  id: string;
  title: string;
  globalBounds: Rectangle;
  localBounds: Rectangle;
}

export interface CursorSnapshot extends Point {
  visible: boolean;
}

export type CaptureMode = "region" | "repeat" | "fullscreen";

export interface CaptureSession {
  id: string;
  createdAt: string;
  mode: CaptureMode;
  virtualBounds: Rectangle;
  displays: DisplaySnapshot[];
  windows: WindowTarget[];
  cursor: CursorSnapshot;
  initialSelection: Rectangle | null;
  autoCopy: boolean;
  captureCursor: boolean;
  primaryScaleFactor: number;
}

export interface AnnotationBase {
  id: string;
  color: string;
  strokeWidth: number;
}

export interface RectangleAnnotation extends AnnotationBase {
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EllipseAnnotation extends AnnotationBase {
  type: "ellipse";
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArrowAnnotation extends AnnotationBase {
  type: "arrow";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PenAnnotation extends AnnotationBase {
  type: "pen";
  points: Point[];
}

export interface TextAnnotation extends AnnotationBase {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

export interface MosaicAnnotation extends AnnotationBase {
  type: "mosaic";
  x: number;
  y: number;
  width: number;
  height: number;
  blockSize: number;
}

export type Annotation =
  | RectangleAnnotation
  | EllipseAnnotation
  | ArrowAnnotation
  | PenAnnotation
  | TextAnnotation
  | MosaicAnnotation;

export type AnnotationTool =
  | "select"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "pen"
  | "text"
  | "mosaic";

export type CommitOperation =
  | "copy"
  | "copy-original"
  | "save"
  | "pin";

export interface CommitRequest {
  sessionId: string;
  operation: CommitOperation;
  selection: Rectangle;
  finalImage: Uint8Array;
  originalImage: Uint8Array;
  width: number;
  height: number;
}

export interface CommitResult {
  operation: CommitOperation;
  savedPath?: string;
  pinId?: string;
}

export type ThemeMode = "system" | "light" | "dark";

export interface AppSettings {
  version: 1;
  hotkey: string;
  captureCursor: boolean;
  autoCopy: boolean;
  launchAtLogin: boolean;
  saveDirectory: string;
  theme: ThemeMode;
}

export interface HotkeyRegistrationResult {
  ok: boolean;
  hotkey: string;
  error?: string;
}

export interface SettingsUpdateResult {
  settings: AppSettings;
  hotkey: HotkeyRegistrationResult;
}

export interface PinInfo {
  id: string;
  imagePath: string;
  imageUrl: string;
  width: number;
  height: number;
}

export interface ToolboxApi {
  getBootstrap(): Promise<{
    settings: AppSettings;
    hotkeyError: string | null;
    platform: string;
    version: string;
  }>;
  startCapture(mode: CaptureMode): Promise<{ ok: boolean; error?: string }>;
  getCaptureSession(sessionId: string): Promise<CaptureSession>;
  commitCapture(request: CommitRequest): Promise<CommitResult>;
  cancelCapture(sessionId: string): Promise<void>;
  getPin(pinId: string): Promise<PinInfo>;
  copyPin(pinId: string): Promise<void>;
  closePin(pinId: string): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): Promise<SettingsUpdateResult>;
  chooseSaveDirectory(): Promise<string | null>;
  showMainWindow(section?: string): Promise<void>;
  quit(): Promise<void>;
  onHotkeyError(callback: (message: string) => void): () => void;
  onNavigate(callback: (section: string) => void): () => void;
  listBatteryCandidates(): Promise<BatteryLiveDevice[]>;
  listBatteryDevices(): Promise<Record<string, BatteryDevice>>;
  addBatteryDevice(request: BatteryAddRequest): Promise<BatteryDevice>;
  removeBatteryDevice(id: string): Promise<void>;
  renameBatteryDevice(id: string, name: string): Promise<BatteryDevice>;
  setBatteryDeviceIcon(id: string, icon: string | null): Promise<BatteryDevice>;
  setBatteryDeviceHidden(id: string, hidden: boolean): Promise<BatteryDevice>;
  setBatteryDeviceAlert(id: string, threshold: number | null): Promise<BatteryDevice>;
  reorderBatteryDevices(ids: string[]): Promise<void>;
  pollBatteryDevicesNow(): Promise<void>;
  captureBatteryCalibration(id: string): Promise<BatteryCalibrationFrame[]>;
  getBatterySettings(): Promise<BatterySettings>;
  updateBatterySettings(patch: Partial<BatterySettings>): Promise<BatterySettings>;
  runBatteryDiagnostics(): Promise<BatteryDiagnosticResult>;
  onBatteryUpdate(callback: (device: BatteryDevice) => void): () => void;
  onBatteryDevicesChanged(callback: () => void): () => void;
}

