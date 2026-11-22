import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
    await expect(
      page.locator(".sidebar-tools .nav-item span"),
    ).toHaveText(["Battery Hub", "截图", "媒体整理"]);
    await page.getByRole("button", { name: "截图", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "开始截图" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "重复上次选区" }),
    ).toHaveCount(0);
    await expect(page.getByText("当前显示器", { exact: true })).toHaveCount(0);
    await expect(page.getByText("上次选区", { exact: true })).toHaveCount(0);

    const logPath = join(userData, "logs", "toolbox.log");
    await expect
      .poll(async () => {
        try {
          return await readFile(logPath, "utf8");
        } catch {
          return "";
        }
      })
      .toContain("全局快捷键注册");
    const logs = await readFile(logPath, "utf8");
    expect(logs).toContain("应用启动");
    expect(logs).toContain("插件初始化开始");

    await page.getByRole("button", { name: "系统设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "系统设置" })).toBeVisible();
    await expect(page.getByText("所有数据只保存在本机")).toBeVisible();

    await page.getByRole("button", { name: "查看日志" }).click();
    await expect(page.getByRole("heading", { name: "运行日志" })).toBeVisible();
    await expect(page.getByLabel("运行日志内容")).toContainText("应用启动");
    await page.getByRole("button", { name: "复制日志" }).click();
    await expect
      .poll(() =>
        electronApp.evaluate(({ clipboard }) => clipboard.readText()),
      )
      .toContain("应用启动");
    await page.getByRole("button", { name: "关闭" }).click();
    await expect(page.getByRole("heading", { name: "运行日志" })).toHaveCount(0);
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
});
