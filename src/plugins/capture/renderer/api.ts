import type { CaptureApi } from "../shared/api";
import type {
  CaptureMode,
  CaptureSettings,
  CommitRequest,
} from "../shared/types";

const invoke = <T>(channel: string, payload?: unknown): Promise<T> =>
  window.toolbox.invokePlugin<T>("capture", channel, payload);

export const captureApi: CaptureApi = {
  start: (mode: CaptureMode) => invoke("start", { mode }),
  getSession: (sessionId: string) => invoke("get-session", { sessionId }),
  commit: (request: CommitRequest) => invoke("commit", request),
  cancel: (sessionId: string) => invoke("cancel", { sessionId }),
  getPin: (pinId: string) => invoke("get", { pinId }),
  copyPin: (pinId: string) => invoke("copy", { pinId }),
  closePin: (pinId: string) => invoke("close", { pinId }),
  getSettings: () => invoke("get-settings"),
  checkHotkey: (hotkey: string) => invoke("check-hotkey", { hotkey }),
  updateSettings: (patch: Partial<CaptureSettings>) =>
    invoke("update-settings", patch),
  getStatus: () => invoke("get-status"),
  chooseSaveDirectory: () => invoke("choose-directory"),
};
