import type { PluginRendererModule } from "../../../renderer/src/plugin/types";
import { Icon } from "./icons";
import { OrganizerPage } from "./OrganizerPage";
import "./organizer.css";

function OrganizerNavIcon({ size = 18 }: { size?: number }) {
  return <Icon name="folder-media" size={size} />;
}

export default {
  id: "organizer",
  Icon: OrganizerNavIcon,
  Page: OrganizerPage,
} satisfies PluginRendererModule;
