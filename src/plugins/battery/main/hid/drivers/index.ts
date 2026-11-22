import * as compx from "./compx";
import * as kysona from "./kysona";
import * as mchose from "./mchose";
import * as jzm7 from "./jzm7";
import * as gamesir from "./gamesir";
import * as tabled from "./tabled";
import * as audeze from "./audeze";
import * as razer from "./razer";
import * as playstation from "./playstation";
import * as mosart from "./mosart";
import * as hidpp from "./hidpp";
import * as generic from "./generic";
import type { BatteryDriver } from "./types";
import type { BatteryLogicalDevice } from "../catalog";
import type {
  BatteryCalibrationProfile,
  BatteryReading,
} from "../../../shared/types";

const knownDrivers = [
  compx,
  kysona,
  mchose,
  jzm7,
  gamesir,
  tabled,
  audeze,
  razer,
  playstation,
  mosart,
  hidpp,
] as unknown as BatteryDriver[];

const byId = new Map(knownDrivers.map((driver) => [driver.id, driver]));

export function detectDriver(device: BatteryLogicalDevice): BatteryDriver | null {
  return knownDrivers.find((driver) => driver.matches(device)) ?? null;
}

export function driverById(id: string): BatteryDriver {
  return byId.get(id) ?? generic as unknown as BatteryDriver;
}

export async function readBattery(
  driverId: string,
  device: BatteryLogicalDevice,
  profile: BatteryCalibrationProfile | null,
): Promise<BatteryReading> {
  return driverById(driverId).readBattery(device, profile);
}

export { generic };
