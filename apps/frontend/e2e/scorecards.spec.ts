import { test, expect } from "@playwright/test";
import { loginAs } from "./utils";

test.describe("Master Scorecard — screen 03", () => {
  test("opens from the Balanced Scorecards list and reflects the seeded scorecard's computed data", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/balanced-scorecards");

    await page.getByTestId("open-scorecard-sc-corporate").click();
    await expect(page).toHaveURL("/balanced-scorecards/sc-corporate");

    const scorecardPage = page.getByTestId("master-scorecard-page");
    await expect(scorecardPage).toBeVisible();
    await expect(page.getByTestId("overall-score")).toHaveText("82%");
    // score 82 vs priorScore 77 => +5
    await expect(page.getByTestId("overall-trend")).toContainText("+5");

    const statusCounts = page.getByTestId("status-counts");
    await expect(statusCounts).toContainText("7"); // on-track KPIs
    await expect(statusCounts).toContainText("2"); // at-risk KPIs

    const financialColumn = page.getByTestId("perspective-column-financial");
    await expect(financialColumn).toBeVisible();
    await expect(page.getByTestId("perspective-weight-financial")).toContainText("30%");
  });

  test("grid/map toggle renders the linked StrategyMap read-only, then switches back to perspective columns", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/balanced-scorecards/sc-corporate");

    await expect(page.getByTestId("perspective-columns")).toBeVisible();

    await page.getByTestId("view-toggle-map").click();
    await expect(page.getByTestId("scorecard-map-view")).toBeVisible();
    await expect(page.getByTestId("perspective-columns")).toHaveCount(0);

    await page.getByTestId("view-toggle-grid").click();
    await expect(page.getByTestId("perspective-columns")).toBeVisible();
  });

  test("scorecards without a linked map show an honest empty state, not a broken or faked map", async ({ page }) => {
    await loginAs(page, "member");
    // sc-sales has no mapId in the mock fixture (only sc-corporate is linked to map-corporate).
    await page.goto("/balanced-scorecards/sc-sales");

    await page.getByTestId("view-toggle-map").click();
    await expect(page.getByTestId("map-empty-state")).toBeVisible();
    await expect(page.getByTestId("scorecard-map-view")).toHaveCount(0);
  });

  // Note on scope: the ticket asks for a check "against the KPI detail page's coloring
  // for the same data, proving consistency." The Balanced Scorecards feature and the
  // KPI workspace currently run on two disconnected mock datasets with different KPI id
  // spaces and even a different status enum (ScorecardStatus: on-track/at-risk/draft vs
  // KpiStatus: on-track/at-risk/behind) — there is no real "same data" to cross-check yet.
  // This test instead verifies the one thing that IS real: every objective card's
  // progress-bar color is internally consistent with its own status badge, using the
  // shared scorecardConfig tokens (not page-local colors).
  test("objective card progress-bar color matches its status badge (on-track = emerald, at-risk = amber)", async ({ page }) => {
    await loginAs(page, "member");
    await page.goto("/balanced-scorecards/sc-corporate");

    const onTrackCard = page.getByTestId("objective-card-kpi-corp-fin-1"); // Revenue Growth, on-track, score 88
    await expect(onTrackCard).toContainText("On Track");
    await expect(page.getByTestId("objective-bar-kpi-corp-fin-1")).toHaveClass(/bg-emerald-500/);

    const atRiskCard = page.getByTestId("objective-card-kpi-corp-fin-3"); // EBITDA Growth, at-risk, score 62
    await expect(atRiskCard).toContainText("At Risk");
    await expect(page.getByTestId("objective-bar-kpi-corp-fin-3")).toHaveClass(/bg-amber-500/);
  });
});

test.describe("Master Scorecard — RTL", () => {
  test("summary band and perspective columns render correctly mirrored in Arabic", async ({ page, context }) => {
    await loginAs(page, "member");
    await context.addCookies([
      { name: "stratalign_locale", value: "ar", url: page.url() },
    ]);
    await page.goto("/balanced-scorecards/sc-corporate");

    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");

    await expect(page.getByTestId("summary-band")).toBeVisible();
    await expect(page.getByTestId("perspective-column-financial")).toBeVisible();
    await expect(page.getByTestId("perspective-column-learning-growth")).toBeVisible();

    // The back-link chevron is explicitly flipped for RTL (rtl:rotate-180) since icons
    // don't auto-mirror the way logical-property layout does — confirm the CSS actually
    // applies, not just that the class string is present.
    const transform = await page
      .locator('a[href="/balanced-scorecards"] svg')
      .first()
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform).not.toBe("none");
  });
});
