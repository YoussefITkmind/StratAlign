import { test, expect } from "@playwright/test";
import { loginAs } from "./utils";

/**
 * NOTE ON SCOPE: Prompt 3.3 asks for two Playwright flows this suite
 * deliberately does NOT implement:
 *
 *   1. A full edit -> submit -> approve -> publish -> view flow across three
 *      distinct user sessions.
 *   2. A non-analyst attempting the underlying procedure directly and
 *      getting a server-side rejection.
 *
 * Neither is possible yet: there is no ApprovalCase workflow (Prompt 1.5) or
 * DRAFT-map API (Prompt 3.1) in the backend, and this build's "edit mode"
 * role check is a local dropdown for previewing the UI, not a real session —
 * there is no server-side procedure to call and reject, and no persisted
 * draft that a second session could see. This suite instead covers what's
 * actually real: the view/edit UI and its interactions within one session.
 * The two flows above should be added once that backend work lands.
 */

test.describe("Strategy Map canvas — screen 13 (frontend shell)", () => {
  test("view mode: selecting an objective shows its properties, including the Phase 4 initiative placeholder", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/strategy-maps");
    await page.getByTestId("open-map-canvas-map-corporate").click();

    await expect(page).toHaveURL("/strategy-maps/map-corporate");
    await expect(page.getByTestId("map-canvas-page")).toBeVisible();
    await expect(page.getByTestId("map-status-badge")).toHaveText("Published");

    await page.locator('.react-flow__node[data-id="obj-revenue-growth"]').click();
    const panel = page.getByTestId("node-properties-panel");
    await expect(panel).toContainText("Grow Revenue 20% YoY");
    await expect(panel).toContainText("Coming in Phase 4");
    await expect(panel).toContainText("Not tracked yet");
  });

  test("edit mode is only reachable after switching the (mock) viewer role to strategy analyst", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/strategy-maps/map-corporate");

    await expect(page.getByTestId("edit-mode-toggle")).toBeDisabled();

    await page.getByTestId("viewer-role-select").selectOption("strategy_analyst");
    await expect(page.getByTestId("edit-mode-toggle")).toBeEnabled();

    await page.getByTestId("edit-mode-toggle").click();
    await expect(page.getByTestId("edit-toolbar")).toBeVisible();
  });

  test("adds an objective reference and a link with a strength, then submits the local draft", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/strategy-maps/map-corporate");
    await page.getByTestId("viewer-role-select").selectOption("strategy_analyst");
    await page.getByTestId("edit-mode-toggle").click();

    await page.getByTestId("add-objective-reference-button").click();
    await page.getByTestId("unplaced-objective-obj-pricing-strategy").click();
    await expect(page.getByTestId("pending-changes-list")).toContainText("Refresh Pricing Strategy");

    await page.getByTestId("draw-link-button").click();
    await page.locator('.react-flow__node[data-id="obj-revenue-growth"]').click();
    await page.locator('.react-flow__node[data-id="obj-pricing-strategy"]').click();
    await page.getByTestId("link-strength-select").selectOption("strong");
    await page.getByTestId("confirm-link-button").click();
    await expect(page.getByTestId("pending-changes-list")).toContainText("Added link: strong");

    await page.getByTestId("submit-for-approval-button").click();
    await expect(page.getByTestId("map-status-badge")).toContainText("Draft");
    await expect(page.getByTestId("draft-banner")).toBeVisible();
    await expect(page.getByTestId("edit-toolbar")).toHaveCount(0);
  });
});
