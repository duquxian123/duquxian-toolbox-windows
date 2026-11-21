import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const pluginsRoot = resolve("src/plugins");
const workerEntries = Object.fromEntries(
  readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) =>
      existsSync(resolve(pluginsRoot, entry.name, "main", "worker.ts")),
    )
    .map((entry) => [
      `${entry.name}-worker`,
      resolve(pluginsRoot, entry.name, "main", "worker.ts"),
    ]),
);

export default defineConfig({
  main: {
    // exifr 是纯 JS 依赖，直接打进 out/main，避免在 files/asarUnpack 中单独分发
    plugins: [externalizeDepsPlugin({ exclude: ["exifr"] })],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@plugins": resolve("src/plugins"),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve("src/main/index.ts"),
          ...workerEntries,
        },
        output: {
          entryFileNames: "[name].js",
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@plugins": resolve("src/plugins"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve("src/preload/index.ts"),
        output: {
          format: "cjs",
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  renderer: {
    root: resolve("src/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
        "@plugins": resolve("src/plugins"),
      },
    },
    build: {
      rollupOptions: {
        input: resolve("src/renderer/index.html"),
      },
    },
  },
});
