import type { CoreToolboxApi } from "../../shared/types";

declare global {
  interface Window {
    toolbox: CoreToolboxApi;
  }
}

export {};
