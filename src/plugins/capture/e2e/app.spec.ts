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
    await mainPage.evaluate(() =>
      window.toolbox.invokePlugin("capture", "start", { mode: "region" }),
    );
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
      (id) =>
        window.toolbox.invokePlugin("capture", "get-session", {
          sessionId: id,
        }),
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
    await expect(overlay.locator(".selection-preview")).toBeVisible();
    expect(await overlay.locator(".capture-dim").count()).toBe(0);
    expect(
      await overlay.evaluate(() => {
        const preview = document
          .querySelector(".selection-preview")
          ?.getBoundingClientRect();
        if (!preview) {
          return false;
        }
        const centerX = preview.left + preview.width / 2;
        const centerY = preview.top + preview.height / 2;
        return [...document.querySelectorAll(".shade")].every((element) => {
          const rect = element.getBoundingClientRect();
          return !(
            centerX >= rect.left &&
            centerX <= rect.right &&
            centerY >= rect.top &&
            centerY <= rect.bottom
          );
        });
      }),
    ).toBe(true);
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
      await mainPage.evaluate(() => "plugins" in window),
    ).toBe(false);

    const edgeOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() =>
      window.toolbox.invokePlugin("capture", "start", { mode: "region" }),
    );
    const edgeOverlay = await edgeOverlayPromise;
    await edgeOverlay.locator(".capture-overlay").waitFor({ state: "visible" });
    await edgeOverlay.mouse.move(viewport.width - 520, 180);
    await edgeOverlay.mouse.down();
    await edgeOverlay.mouse.move(viewport.width - 8, 680, { steps: 8 });
    await edgeOverlay.mouse.up();
    await expect(edgeOverlay.locator(".annotation-toolbar")).toBeVisible();
    await expect
      .poll(() =>
        edgeOverlay.evaluate(() => {
          const toolbar = document
            .querySelector(".annotation-toolbar")
            ?.getBoundingClientRect();
          return toolbar ? toolbar.right : Number.POSITIVE_INFINITY;
        }),
      )
      .toBeLessThanOrEqual(viewport.width);
    const edgeBounds = await edgeOverlay.evaluate(() => {
      const toolbar = document
        .querySelector(".annotation-toolbar")
        ?.getBoundingClientRect();
      return toolbar ? { left: toolbar.left, right: toolbar.right } : null;
    });
    expect(edgeBounds).not.toBeNull();
    expect(edgeBounds?.left).toBeGreaterThanOrEqual(0);
    expect(edgeBounds?.right).toBeLessThanOrEqual(viewport.width);
    await expect(edgeOverlay.getByRole("button", { name: /保存/ })).toBeVisible();
    await expect(edgeOverlay.getByRole("button", { name: /贴图/ })).toBeVisible();
    await expect(edgeOverlay.getByRole("button", { name: /复制/ })).toBeVisible();
    await expect(edgeOverlay.locator(".toolbar-close")).toBeVisible();
    await edgeOverlay.locator(".toolbar-close").click();
    await expect.poll(async () => edgeOverlay.isClosed()).toBe(true);

    const repeatOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() =>
      window.toolbox.invokePlugin("capture", "start", { mode: "repeat" }),
    );
    const repeatOverlay = await repeatOverlayPromise;
    await expect(repeatOverlay.locator(".annotation-toolbar")).toBeVisible();
    await electronApp.evaluate(({ clipboard }) => clipboard.clear());
    await repeatOverlay.keyboard.press("Enter");
    await expect.poll(async () => repeatOverlay.isClosed()).toBe(true);
    expect(
      await electronApp.evaluate(async ({ clipboard }) =>
        clipboard.has("image/png"),
      ),
    ).toBe(true);

    const windowOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() =>
      window.toolbox.invokePlugin("capture", "start", { mode: "region" }),
    );
    const windowOverlay = await windowOverlayPromise;
    const sessionId = new URL(windowOverlay.url()).searchParams.get("sessionId") ?? "";
    const captureSession = await windowOverlay.evaluate(
      (id) =>
        window.toolbox.invokePlugin("capture", "get-session", {
          sessionId: id,
        }),
      sessionId,
    );
    expect(captureSession.windows.length).toBeGreaterThan(0);
    await windowOverlay.mouse.move(500, 300);
    await windowOverlay.waitForTimeout(300);
    await windowOverlay.screenshot({ path: "test-results/window-hover.png" });
    await expect(windowOverlay.locator(".window-highlight")).toBeVisible();
    expect(await windowOverlay.locator(".capture-dim").count()).toBe(0);
    expect(await windowOverlay.locator(".shade").count()).toBe(4);
    await windowOverlay.mouse.click(500, 300);
    await expect(windowOverlay.locator(".annotation-toolbar")).toBeVisible();
    await windowOverlay.locator(".toolbar-close").click();
    await expect.poll(async () => windowOverlay.isClosed()).toBe(true);

    const saveDirectory = join(userData, "saved");
    await mainPage.evaluate(
      (directory) =>
        window.toolbox.invokePlugin("capture", "update-settings", {
          saveDirectory: directory,
        }),
      saveDirectory,
    );
    const saveOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() =>
      window.toolbox.invokePlugin("capture", "start", {
        mode: "fullscreen",
      }),
    );
    const saveOverlay = await saveOverlayPromise;
    await expect(saveOverlay.locator(".annotation-toolbar")).toBeVisible();
    await saveOverlay.getByRole("button", { name: /保存/ }).click();
    await expect.poll(async () => saveOverlay.isClosed()).toBe(true);
    expect(existsSync(saveDirectory)).toBe(true);
    expect((await readdir(saveDirectory)).some((name) => name.endsWith(".png"))).toBe(true);

    const pinOverlayPromise = electronApp.waitForEvent("window");
    await mainPage.evaluate(() =>
      window.toolbox.invokePlugin("capture", "start", {
        mode: "fullscreen",
      }),
    );
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

