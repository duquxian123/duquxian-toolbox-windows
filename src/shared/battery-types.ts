export interface BatteryReading {
  capacity: number;
  charging: boolean | null;
  voltageMv?: number | null;
  raw?: number[];
}

export interface BatteryHistoryPoint {
  t: number;
  c: number;
  ch: 0 | 1;
}

export interface BatteryCalibrationProfile {
  usagePage: number;
  usage?: number;
  reportKind: "feature" | "input";
  reportId: number;
  readLength: number;
  trigger: number[] | null;
  byteOffset: number;
  scaleMin: number;
  scaleMax: number;
}

export interface BatteryDeviceRoute {
  id: string;
  driverId: string;
  profile: BatteryCalibrationProfile | null;
}

export interface BatteryDevice {
  id: string;
  product: string;
  manufacturer: string;
  driverId: string;
  profile: BatteryCalibrationProfile | null;
  customName?: string | null;
  customIcon?: string | null;
  order?: number | null;
  hidden?: boolean;
  alertThreshold?: number | null;
  lastReading?: BatteryReading | null;
  lastReadingAt?: number | null;
  lastError?: string | null;
  online?: boolean;
  failedReads?: number;
  history?: BatteryHistoryPoint[];
  links?: BatteryDeviceRoute[];
  identity?: string | null;
}

export interface BatteryLiveDevice {
  id: string;
  product: string;
  manufacturer: string;
  serialNumber?: string;
  vendorId?: number;
  productId?: number;
  channelCount: number;
  suggestedDriver: string | null;
}

export interface BatteryCalibrationFrame {
  usagePage: number;
  usage: number;
  reportKind: "feature" | "input";
  reportId: number;
  bytes: number[];
  hex: string;
  count: number;
  firstSeen: number;
  lastSeen: number;
}

export interface BatteryAddRequest {
  id: string;
  driverId: string;
  profile?: BatteryCalibrationProfile | null;
  product: string;
  manufacturer: string;
}

export interface BatterySettings {
  pollIntervalSec: number;
  density: "detailed" | "compact";
  sortMode: "urgent" | "manual";
  notifyEnabled: boolean;
  notifyThreshold: number;
  notifyCharging: boolean;
  notifyCharged: boolean;
  trayEnabled: boolean;
}

export interface BatteryDiagnosticCheck {
  id: string;
  title: string;
  status: "ok" | "warn" | "fail";
  detail: string;
  fix?: string;
}

export interface BatteryDiagnosticResult {
  verdict: {
    tone: "good" | "warn" | "bad";
    title: string;
    detail: string;
  };
  checks: BatteryDiagnosticCheck[];
}
