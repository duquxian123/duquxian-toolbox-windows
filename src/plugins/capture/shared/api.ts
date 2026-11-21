import type {
  CaptureHotkeyResult,
  CaptureMode,
  CaptureSession,
  CaptureSettings,
  CaptureSettingsUpdateResult,
  CaptureStatus,
  CommitRequest,
  CommitResult,
  PinInfo,
} from "./types";

export interface CaptureApi {
  start(mode: CaptureMode): Promise<{ ok: boolean; error?: string }>;
  getSession(sessionId: string): Promise<CaptureSession>;
  commit(request: CommitRequest): Promise<CommitResult>;
  cancel(sessionId: string): Promise<void>;
  getPin(pinId: string): Promise<PinInfo>;
  copyPin(pinId: string): Promise<void>;
  closePin(pinId: string): Promise<void>;
  getSettings(): Promise<CaptureSettings>;
  checkHotkey(hotkey: string): Promise<CaptureHotkeyResult>;
  updateSettings(
    patch: Partial<CaptureSettings>,
  ): Promise<CaptureSettingsUpdateResult>;
  getStatus(): Promise<CaptureStatus>;
  chooseSaveDirectory(): Promise<string | null>;
}
