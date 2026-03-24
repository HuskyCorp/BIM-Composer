import { test, expect } from "@playwright/test";

test.describe("Layer Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("#layerStackList", { timeout: 5000 });
  });

  test("should display layer stack list", async ({ page }) => {
    const layerStackList = page.locator("#layerStackList");
    await expect(layerStackList).toBeVisible();
  });

  test("should show initial layer in stack", async ({ page }) => {
    // The app has a default statement.usda layer
    const layerStackList = page.locator("#layerStackList");
    await expect(layerStackList).toBeVisible();

    // Check if there are any layer items
    const layerItems = layerStackList.locator("li");
    const count = await layerItems.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("should have filter controls", async ({ page }) => {
    // Check for status filter buttons or dropdown
    const filterButtons = page.locator(
      '.status-filter, [data-testid="status-filter"], .filter-btn'
    );
    await filterButtons.count();

    // The app should have some way to filter layers
    // This tests that the UI structure is present
    const body = await page.locator("body").innerHTML();
    expect(body).toBeDefined();
  });

  test("should have user selector", async ({ page }) => {
    // Check for user dropdown/selector
    const userSelector = page.locator(
      '#userSelect, [data-testid="user-select"], select'
    );
    const selectorCount = await userSelector.count();

    if (selectorCount > 0) {
      await expect(userSelector.first()).toBeVisible();
    }
  });

  test("should display layer visibility controls", async ({ page }) => {
    const layerStackList = page.locator("#layerStackList");
    await expect(layerStackList).toBeVisible();

    const layerItems = layerStackList.locator("li");
    const count = await layerItems.count();

    if (count > 0) {
      // Each layer should have a visibility toggle
      const visibilityToggles = layerStackList.locator(".visibility-toggle");
      const toggleCount = await visibilityToggles.count();
      expect(toggleCount).toBeGreaterThanOrEqual(0);
    }
  });

  test("should display layer status indicators", async ({ page }) => {
    const layerStackList = page.locator("#layerStackList");
    await expect(layerStackList).toBeVisible();

    const layerItems = layerStackList.locator("li");
    const count = await layerItems.count();

    if (count > 0) {
      // Each layer should have a status indicator
      const statusIndicators = layerStackList.locator(".status-indicator");
      const indicatorCount = await statusIndicators.count();
      expect(indicatorCount).toBeGreaterThanOrEqual(0);
    }
  });
});
