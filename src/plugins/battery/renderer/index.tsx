import type { PluginRendererModule } from "../../../renderer/src/plugin/types";
import { Icon } from "./icons";
import { BatteryHubPage } from "./BatteryHubPage";
import "./battery.css";

function BatteryNavIcon({ size = 18 }: { size?: number }) {
  return <Icon name="battery" size={size} />;
}

export default {
  id: "battery",
  Icon: BatteryNavIcon,
  Page: BatteryHubPage,
} satisfies PluginRendererModule;
