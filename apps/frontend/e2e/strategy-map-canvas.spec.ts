import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { test, expect } from "@playwright/test";

import { loginAs } from "./utils";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");

interface ScorecardFixture {
  scorecardId: string;
  revenueObjectiveId: string;
  csatObjectiveId: string;
  aliceId: string;
  bobId: string;
}

async function seedScorecardFixture(): Promise<ScorecardFixture> {
  const result = await execFileAsync(
    "pnpm",
    ["--filter", "@spm/backend", "exec", "tsx", "prisma/e2e-scorecard-seed.ts"],
    { cwd: workspaceRoot, env: process.env },
  );
  const line = result.stdout.trim().split("\n").at(-1);
  if (!line) throw new Error("Scorecard E2E seed produced no output");
  return JSON.parse(line) as ScorecardFixture;
}

test.describe("Strategy Map canvas — screen 13, real Prompt 3.1/1.5 data", () => {
  let fixture: ScorecardFixture;

  test.beforeAll(async () => {
    fixture = await seedScorecardFixture();
  });

  test("three real sessions: analyst edits and submits, a different user approves, a read-only user sees the new published link", async ({ browser }) => {
    test.setTimeout(120_000);

    // Session 1: the analyst (real strategy_analyst role grant) drafts and submits a new link.
    const analystContext = await browser.newContext();
    const analystPage = await analystContext.newPage();
    await loginAs(analystPage, "member"); // seeded with the real strategy_analyst role
    await analystPage.goto(`/strategy-maps/${fixture.scorecardId}`);
    await expect(analystPage.getByTestId("map-canvas-page")).toBeVisible();
    await expect(analystPage.getByTestId("edit-mode-toggle")).toBeEnabled();

    await analystPage.getByTestId("edit-mode-toggle").click();
    await expect(analystPage.getByTestId("edit-toolbar")).toBeVisible();
    // Entering edit mode seeds the draft from the currently published link.
    await expect(analystPage.getByTestId("pending-changes-list")).toContainText("strong");

    await analystPage.getByTestId("draw-link-button").click();
    await analystPage.locator(`.react-flow__node[data-id="${fixture.csatObjectiveId}"]`).click();
    await analystPage.locator(`.react-flow__node[data-id="${fixture.revenueObjectiveId}"]`).click();
    await analystPage.getByTestId("link-strength-select").selectOption("weak");
    await analystPage.getByTestId("confirm-link-button").click();
    await expect(analystPage.getByTestId("pending-changes-list")).toContainText("weak");

    await analystPage.getByTestId("approver-user-id-input").fill(fixture.bobId);
    await analystPage.getByTestId("submit-for-approval-button").click();

    const banner = analystPage.getByTestId("proposed-case-banner");
    await expect(banner).toBeVisible();
    const bannerText = await banner.innerText();
    const caseId = bannerText.match(/Case:\s*([0-9a-f-]{36})/i)?.[1];
    if (!caseId) throw new Error(`No case id found in: ${bannerText}`);
    const draftMapId = await analystPage.getByTestId("publish-map-id-input").inputValue();
    await analystContext.close();

    // Session 2: a genuinely different user (platform_administrator) approves the case.
    const approverContext = await browser.newContext();
    const approverPage = await approverContext.newPage();
    await loginAs(approverPage, "platform_administrator");
    await approverPage.goto(`/approvals/${caseId}`);
    await approverPage.getByTestId("approve-case").click();
    await expect(approverPage.getByTestId("decision-badge")).toContainText("Approved");
    await approverContext.close();

    // Analyst returns (still session-appropriate: any strategy_analyst) to publish the approved change.
    const publisherContext = await browser.newContext();
    const publisherPage = await publisherContext.newPage();
    await loginAs(publisherPage, "member");
    await publisherPage.goto(`/strategy-maps/${fixture.scorecardId}`);
    await publisherPage.getByTestId("publish-map-id-input").fill(draftMapId);
    await publisherPage.getByTestId("publish-case-id-input").fill(caseId);
    await publisherPage.getByTestId("publish-map-button").click();
    await expect(publisherPage.getByTestId("map-publish-notice")).toBeVisible();
    await publisherContext.close();

    // Session 3: a genuinely different, read-only (non-analyst) user sees the newly published link.
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();
    await loginAs(viewerPage, "executive_viewer");
    await viewerPage.goto(`/strategy-maps/${fixture.scorecardId}`);
    await expect(viewerPage.getByTestId("map-canvas-page")).toBeVisible();
    await expect(viewerPage.getByTestId("edit-mode-toggle")).toBeDisabled();
    await expect(viewerPage.locator(".react-flow__edge")).toHaveCount(2);
    await viewerContext.close();
  });

  test("a non-analyst is rejected server-side calling the map draft procedure directly, not merely blocked by disabled UI", async ({ page }) => {
    await loginAs(page, "executive_viewer");

    const response = await page.request.post("/api/trpc/scorecard.map.draftLink", {
      data: {
        json: {
          scorecardId: fixture.scorecardId,
          link: { fromObjectiveId: fixture.revenueObjectiveId, toObjectiveId: fixture.csatObjectiveId, strength: "weak" },
        },
      },
    });
    expect(response.status()).toBe(403);
  });
});
