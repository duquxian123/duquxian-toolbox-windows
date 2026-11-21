import type {
  BatteryAddRequest,
  BatteryCalibrationFrame,
  BatteryDevice,
  BatteryDiagnosticResult,
  BatteryLiveDevice,
  BatterySettings,
} from "./types";

export interface BatteryApi {
  listCandidates(): Promise<BatteryLiveDevice[]>;
  listDevices(): Promise<Record<string, BatteryDevice>>;
  addDevice(request: BatteryAddRequest): Promise<BatteryDevice>;
  removeDevice(id: string): Promise<void>;
  renameDevice(id: string, name: string): Promise<BatteryDevice>;
  setDeviceIcon(id: string, icon: string | null): Promise<BatteryDevice>;
  setDeviceHidden(id: string, hidden: boolean): Promise<BatteryDevice>;
  setDeviceAlert(id: string, threshold: number | null): Promise<BatteryDevice>;
  reorderDevices(ids: string[]): Promise<void>;
  pollNow(): Promise<void>;
  captureCalibration(id: string): Promise<BatteryCalibrationFrame[]>;
  getSettings(): Promise<BatterySettings>;
  updateSettings(patch: Partial<BatterySettings>): Promise<BatterySettings>;
  runDiagnostics(): Promise<BatteryDiagnosticResult>;
  onUpdate(callback: (device: BatteryDevice) => void): () => void;
  onDevicesChanged(callback: () => void): () => void;
}
