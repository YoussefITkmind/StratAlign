import { test, expect } from "@playwright/test";
import { loginAs } from "./utils";

test.describe("Home landing — screen 02", () => {
  test("executive_viewer sees the executive widget composition, populated with real Phase 2/3 fixture data", async ({ page }) => {
    await loginAs(page, "executive_viewer");
    await page.goto("/overview");

    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.getByTestId("home-role-label")).toHaveText("Executive viewer");

    await expect(page.getByTestId("widget-kpi-tiles")).toBeVisible();
    await expect(page.getByTestId("widget-exceptions")).toBeVisible();
    await expect(page.getByTestId("widget-scorecard-strip")).toBeVisible();
    await expect(page.getByTestId("widget-review-calendar")).toBeVisible();
    await expect(page.getByTestId("widget-map-thumbnail")).toBeVisible();

    // kpi_owner-only widgets must not leak into this composition.
    await expect(page.getByTestId("widget-owned-kpis")).toHaveCount(0);
    await expect(page.getByTestId("widget-due-submissions")).toHaveCount(0);

    // Real fixture data, not placeholders: sc-corporate from mockScorecardData
    // and one of the off-track KPIs from mockKpiData.
    await expect(page.getByTestId("scorecard-strip-item-sc-corporate")).toContainText("82%");
    await expect(page.getByTestId("widget-exceptions")).toContainText("Customer Churn Rate");
  });

  test("kpi_owner sees a different, owner-focused composition, populated with their real owned KPIs", async ({ page }) => {
    await loginAs(page, "kpi_owner");
    await page.goto("/overview");

    await expect(page.getByTestId("home-page")).toBeVisible();
    await expect(page.getByTestId("home-role-label")).toHaveText("KPI owner");

    await expect(page.getByTestId("widget-owned-kpis")).toBeVisible();
    await expect(page.getByTestId("widget-due-submissions")).toBeVisible();
    await expect(page.getByTestId("widget-exceptions")).toBeVisible();

    // Executive-only widgets must not leak into this composition.
    await expect(page.getByTestId("widget-kpi-tiles")).toHaveCount(0);
    await expect(page.getByTestId("widget-scorecard-strip")).toHaveCount(0);
    await expect(page.getByTestId("widget-review-calendar")).toHaveCount(0);
    await expect(page.getByTestId("widget-map-thumbnail")).toHaveCount(0);

    // Real fixture data: Jamie Park owns kpi-churn and kpi-csat in mockKpiData,
    // and mockCadenceTasks has a matching submission task for each.
    await expect(page.getByTestId("owned-kpi-kpi-churn")).toBeVisible();
    await expect(page.getByTestId("owned-kpi-kpi-csat")).toBeVisible();
    await expect(page.getByTestId("due-submission-task-churn-q")).toBeVisible();
    await expect(page.getByTestId("due-submission-task-csat-q")).toBeVisible();
  });

  test("the two role compositions are genuinely different widget sets, not just re-labeled", async ({ page }) => {
    await loginAs(page, "executive_viewer");
    await page.goto("/overview");
    const executiveWidgets = await page.getByTestId("home-widgets").locator("[data-testid^='widget-slot-']").evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute("data-testid"))
    );

    await loginAs(page, "kpi_owner");
    await page.goto("/overview");
    const ownerWidgets = await page.getByTestId("home-widgets").locator("[data-testid^='widget-slot-']").evaluateAll(
      (nodes) => nodes.map((n) => n.getAttribute("data-testid"))
    );

    expect(executiveWidgets.length).toBeGreaterThan(0);
    expect(ownerWidgets.length).toBeGreaterThan(0);
    expect(executiveWidgets).not.toEqual(ownerWidgets);
  });
});
