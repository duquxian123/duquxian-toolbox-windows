import { _electron as electron, expect, test } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("opens the integrated Battery Hub workspace", async () => {
  const userData = await mkdtemp(join(tmpdir(), "toolbox-battery-e2e-"));
  const electronApp = await electron.launch({
    args: [resolve(".")],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TOOLBOX_TEST_USER_DATA: userData,
      TOOLBOX_DISABLE_BATTERY_MIGRATION: "1",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Battery Hub", exact: true }).click();
    await expect(page.getByRole("heading", { name: "设备" })).toBeVisible();
    await page.waitForTimeout(250);
    await expect(page.getByText("还没有添加外设")).toBeVisible();
    await expect(page.locator(".battery-nav-item")).toHaveCount(0);
    await expect(page.locator(".battery-nav")).not.toContainText("电量与历史只保存在本机");
    await page.screenshot({ path: "test-results/battery-hub.png" });

    await page.getByRole("button", { name: "添加设备", exact: true }).click();
    await expect(page.getByRole("heading", { name: "添加设备" })).toBeVisible();
    await page.getByRole("button", { name: "返回设备", exact: true }).click();
    await expect(page.getByRole("heading", { name: "设备" })).toBeVisible();

    await page.getByRole("button", { name: "Battery Hub 设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Battery Hub 设置" })).toBeVisible();
    await page.getByRole("button", { name: "返回设备", exact: true }).click();
    await expect(page.getByRole("heading", { name: "设备" })).toBeVisible();
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("renames a device with the in-app editor", async () => {
  const userData = await mkdtemp(join(tmpdir(), "toolbox-battery-rename-"));
  await mkdir(userData, { recursive: true });
  await writeFile(
    join(userData, "battery-hub.json"),
    JSON.stringify({
      version: 1,
      migratedFromBatteryHub: true,
      devices: {
        "test-keyboard": {
          id: "test-keyboard",
          product: "Fallback Keyboard",
          manufacturer: "Test",
          driverId: "system",
          profile: null,
          lastReading: { capacity: 65, charging: false },
          lastReadingAt: Date.now(),
          online: true,
          history: [],
        },
      },
      settings: {
        pollIntervalSec: 60,
        density: "detailed",
        sortMode: "urgent",
        notifyEnabled: true,
        notifyThreshold: 20,
        notifyCharging: true,
        notifyCharged: false,
        trayEnabled: true,
      },
    }),
    "utf8",
  );

  const electronApp = await electron.launch({
    args: [resolve(".")],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TOOLBOX_TEST_USER_DATA: userData,
      TOOLBOX_DISABLE_BATTERY_MIGRATION: "1",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Battery Hub", exact: true }).click();
    const card = page.locator(".battery-device-card").first();
    await expect(card).toBeVisible();
    await card.hover();
    await card.getByTitle("重命名").click();
    await expect(page.getByRole("heading", { name: "重命名设备" })).toBeVisible();
    await page.getByPlaceholder("设备名称").fill("客厅键盘");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(card.getByText("客厅键盘", { exact: true })).toBeVisible();
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
});

test("keeps the Battery Hub layout separated in a narrow window", async () => {
  const userData = await mkdtemp(join(tmpdir(), "toolbox-battery-narrow-"));
  await mkdir(userData, { recursive: true });
  await writeFile(
    join(userData, "battery-hub.json"),
    JSON.stringify({
      version: 1,
      migratedFromBatteryHub: true,
      devices: {
        "gamesir-nova-2-lite": {
          id: "gamesir-nova-2-lite",
          product: "GameSir Nova 2 Lite（启明星2）",
          manufacturer: "GameSir",
          driverId: "system",
          profile: null,
          lastReading: { capacity: 60, charging: false },
          lastReadingAt: Date.now(),
          online: true,
          history: [],
        },
      },
      settings: {
        pollIntervalSec: 60,
        density: "detailed",
        sortMode: "urgent",
        notifyEnabled: true,
        notifyThreshold: 20,
        notifyCharging: true,
        notifyCharged: false,
        trayEnabled: true,
      },
    }),
    "utf8",
  );

  const electronApp = await electron.launch({
    args: [resolve(".")],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TOOLBOX_TEST_USER_DATA: userData,
      TOOLBOX_DISABLE_BATTERY_MIGRATION: "1",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.setViewportSize({ width: 847, height: 768 });
    await page.getByRole("button", { name: "Battery Hub", exact: true }).click();
    await page.waitForTimeout(300);

    const boxes = await page.evaluate(() => {
      const nav = document.querySelector(".battery-nav")?.getBoundingClientRect();
      const content = document.querySelector(".battery-content")?.getBoundingClientRect();
      const pageContent = document.querySelector(".page-content");
      return {
        navBottom: nav?.bottom ?? 0,
        contentTop: content?.top ?? 0,
        contentOverflow: pageContent
          ? pageContent.scrollWidth - pageContent.clientWidth
          : 0,
      };
    });
    expect(boxes.navBottom).toBeLessThanOrEqual(boxes.contentTop + 1);
    expect(boxes.contentOverflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: "test-results/battery-hub-narrow.png" });
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
});
