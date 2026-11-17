import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { CaptureOverlay } from "./capture/CaptureOverlay";
import { PinWindow } from "./pin/PinWindow";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/pages.css";
import "./styles/capture.css";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");
document.documentElement.dataset.windowView = view ?? "main";
const root = createRoot(document.getElementById("root")!);

if (view === "capture") {
  root.render(
    <StrictMode>
      <CaptureOverlay sessionId={params.get("sessionId") ?? ""} />
    </StrictMode>,
  );
} else if (view === "pin") {
  root.render(
    <StrictMode>
      <PinWindow pinId={params.get("pinId") ?? ""} />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

