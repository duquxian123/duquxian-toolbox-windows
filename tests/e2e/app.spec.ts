import { _electron as electron, expect, test } from "@playwright/test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("launches and completes a region screenshot", async () => {
  const userData = await mkdtemp(join(tmpdir(), "toolbox-e2e-"));
  const electronApp = await electron.launch({
    args: [resolve(".")],
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      TOOLBOX_TEST_USER_DATA: userData,
    },
  });

  try {
    const mainPage = await electronApp.firstWindow();
    await expect(mainPage.getByRole("button", { name: /开始截图/ }).first()).toBeVisible();

    const overlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() => window.toolbox.startCapture("region"));
    const overlay = await overlayPromise;
    overlay.on("pageerror", (error) => {
      console.error("OVERLAY_PAGE_ERROR", error.message);
    });
    overlay.on("console", (message) => {
      if (message.type() === "error") {
        console.error("OVERLAY_CONSOLE", message.text());
      }
    });
    await overlay.waitForLoadState("domcontentloaded");
    await expect(overlay.locator(".capture-overlay")).toBeVisible();
    const firstSession = await overlay.evaluate(
      (id) => window.toolbox.getCaptureSession(id),
      new URL(overlay.url()).searchParams.get("sessionId") ?? "",
    );
    const viewport = await overlay.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }));
    expect(viewport).toEqual({
      width: firstSession.virtualBounds.width,
      height: firstSession.virtualBounds.height,
    });
    await overlay.screenshot({ path: "test-results/capture-overlay.png" });

    await overlay.mouse.move(260, 180);
    await overlay.mouse.down();
    await overlay.mouse.move(960, 680, { steps: 8 });
    await overlay.mouse.up();
    await expect(overlay.locator(".annotation-toolbar")).toBeVisible();

    await overlay.locator('button[title="矩形"]').click();
    await overlay.mouse.move(320, 240);
    await overlay.mouse.down();
    await overlay.mouse.move(540, 360, { steps: 5 });
    await overlay.mouse.up();
    await overlay.screenshot({ path: "test-results/capture-editor.png" });
    await overlay.locator(".toolbar-primary").click();

    await expect.poll(async () => overlay.isClosed()).toBe(true);
    expect(
      await electronApp.evaluate(async ({ clipboard }) =>
        clipboard.has("image/png"),
      ),
    ).toBe(true);
    expect(
      await mainPage.evaluate(() => "listHistory" in window.toolbox),
    ).toBe(false);

    const repeatOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() => window.toolbox.startCapture("repeat"));
    const repeatOverlay = await repeatOverlayPromise;
    await expect(repeatOverlay.locator(".annotation-toolbar")).toBeVisible();
    await repeatOverlay.locator(".toolbar-close").click();
    await expect.poll(async () => repeatOverlay.isClosed()).toBe(true);

    const windowOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() => window.toolbox.startCapture("region"));
    const windowOverlay = await windowOverlayPromise;
    const sessionId = new URL(windowOverlay.url()).searchParams.get("sessionId") ?? "";
    const captureSession = await windowOverlay.evaluate(
      (id) => window.toolbox.getCaptureSession(id),
      sessionId,
    );
    expect(captureSession.windows.length).toBeGreaterThan(0);
    await windowOverlay.mouse.move(500, 300);
    await windowOverlay.waitForTimeout(300);
    await windowOverlay.screenshot({ path: "test-results/window-hover.png" });
    await windowOverlay.mouse.click(500, 300);
    await expect(windowOverlay.locator(".annotation-toolbar")).toBeVisible();
    await windowOverlay.locator(".toolbar-close").click();
    await expect.poll(async () => windowOverlay.isClosed()).toBe(true);

    const saveDirectory = join(userData, "saved");
    await mainPage.evaluate(
      (directory) => window.toolbox.updateSettings({ saveDirectory: directory }),
      saveDirectory,
    );
    const saveOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() => window.toolbox.startCapture("fullscreen"));
    const saveOverlay = await saveOverlayPromise;
    await expect(saveOverlay.locator(".annotation-toolbar")).toBeVisible();
    await saveOverlay.getByRole("button", { name: /保存/ }).click();
    await expect.poll(async () => saveOverlay.isClosed()).toBe(true);
    expect(existsSync(saveDirectory)).toBe(true);
    expect((await readdir(saveDirectory)).some((name) => name.endsWith(".png"))).toBe(true);

    const pinOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() => window.toolbox.startCapture("fullscreen"));
    const pinOverlay = await pinOverlayPromise;
    await expect(pinOverlay.locator(".annotation-toolbar")).toBeVisible();
    const pinWindowPromise = electronApp.waitForEvent("window");
    await pinOverlay.getByRole("button", { name: /贴图/ }).click();
    const pinWindow = await pinWindowPromise;
    await expect(pinWindow.locator(".pin-window img")).toBeVisible();
    await pinWindow.locator('button[title="关闭"]').click();
  } finally {
    await electronApp.close();
    await rm(userData, { recursive: true, force: true });
  }
});

