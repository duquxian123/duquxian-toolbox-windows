import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("launches the shell and opens core settings", async () => {
  const userData = await mkdtemp(join(tmpdir(), "toolbox-shell-e2e-"));
  const electronApp = await electron.launch({
    args: [resolve(".")],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TOOLBOX_TEST_USER_DATA: userData,
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page.locator(".sidebar")).toBeVisible();
    await expect(page.locator(".sidebar-tools .nav-item").first()).toBeVisible();
    await page.getByRole("button", { name: "系统设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "系统设置" })).toBeVisible();
    await expect(page.getByText("所有数据只保存在本机")).toBeVisible();
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
});
