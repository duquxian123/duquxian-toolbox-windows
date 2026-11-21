import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: [
    "tests/e2e/**/*.spec.ts",
    "src/plugins/*/e2e/**/*.spec.ts",
  ],
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
