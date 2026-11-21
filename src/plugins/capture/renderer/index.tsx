import type { PluginRendererModule } from "../../../renderer/src/plugin/types";
import { CaptureOverlay } from "./CaptureOverlay";
import { HomePage } from "./HomePage";
import { PinWindow } from "./PinWindow";
import { Icon } from "./icons";
import "./capture.css";

function CaptureNavIcon({ size = 18 }: { size?: number }) {
  return <Icon name="camera" size={size} />;
}

function CaptureView({ params }: { params: URLSearchParams }) {
  return <CaptureOverlay sessionId={params.get("sessionId") ?? ""} />;
}

function PinView({ params }: { params: URLSearchParams }) {
  return <PinWindow pinId={params.get("pinId") ?? ""} />;
}

export default {
  id: "capture",
  Icon: CaptureNavIcon,
  Page: HomePage,
  views: {
    capture: CaptureView,
    pin: PinView,
  },
} satisfies PluginRendererModule;
