import type {
  BatteryCalibrationProfile,
  BatteryReading,
} from "../../../shared/types";
import type { BatteryLogicalDevice } from "../catalog";

export interface BatteryDriver {
  id: string;
  eventDriven?: boolean;
  hasWiredIdentity?: boolean;
  needsIdentify?: boolean;
  matches(device: BatteryLogicalDevice): boolean;
  readBattery(
    device: BatteryLogicalDevice,
    profile?: BatteryCalibrationProfile | null,
  ): Promise<BatteryReading>;
  identify?(device: BatteryLogicalDevice): Promise<string | null>;
}
