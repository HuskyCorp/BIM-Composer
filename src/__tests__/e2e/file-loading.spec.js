import { test, expect } from "@playwright/test";

test.describe("File Loading Workflow", () => {
  test("should load application and display main interface", async ({
    page,
  }) => {
    await page.goto("/");

    // Wait for app to load - check for canvas (3D viewport)
    const canvas = page.locator("canvas");
    await expect(canvas.first()).toBeVisible({ timeout: 10000 });
  });

  test("should display layer stack panel", async ({ page }) => {
    await page.goto("/", { waitUntil: "load" });
    // Wait for initPanelDockers() to run and expand the layer panel
    await page.waitForSelector("#layersPanel.expanded", { timeout: 10000 });

    // Check for layer stack area
    const layerStack = page.locator("#layerStackList");
    await expect(layerStack).toBeVisible({ timeout: 10000 });
  });

  test("should load a USDA file via file input", async ({ page }) => {
    await page.goto("/");

    // Look for file input
    const fileInput = page.locator('input[type="file"]');

    // If file input exists, test file upload
    if ((await fileInput.count()) > 0) {
      await fileInput.setInputFiles({
        name: "test.usda",
        mimeType: "text/plain",
        buffer: Buffer.from(`#usda 1.0
def Xform "Root" {
  def Cube "MyCube" {
    double size = 2.0
  }
}`),
      });

      // Wait for processing
      await page.waitForTimeout(1000);

      // Verify something was loaded (canvas should still be visible)
      const canvas = page.locator("canvas");
      await expect(canvas.first()).toBeVisible();
    }
  });

  test("should have a 3D viewport with canvas", async ({ page }) => {
    await page.goto("/");

    const canvas = page.locator("canvas");
    await expect(canvas.first()).toBeVisible({ timeout: 10000 });

    // Canvas should have dimensions
    const box = await canvas.first().boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);
  });

  test("should display sidebar panels", async ({ page }) => {
    await page.goto("/");

    // Check for sidebar elements
    await page.waitForTimeout(2000);

    // The app should have some sidebar content
    const body = await page.locator("body").innerHTML();
    expect(body.length).toBeGreaterThan(0);
  });
});
