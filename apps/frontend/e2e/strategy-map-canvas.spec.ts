import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import { loginAs } from "./utils";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");
const backendTrpc = process.env.NEXT_PUBLIC_TRPC_URL ?? "http://localhost:4000/trpc";

interface Fixture {
  scorecardId: string;
  revenueObjectiveId: string;
  csatObjectiveId: string;
  bobId: string;
  extraObjectiveId: string;
  perspectiveId: string;
}

async function runSeed(file: string) {
  const result = await execFileAsync("pnpm", ["--filter", "@spm/backend", "exec", "tsx", `prisma/${file}`], {
    cwd: workspaceRoot,
    env: process.env,
  });
  const line = result.stdout.trim().split("\n").at(-1);
  if (!line) throw new Error(`${file} produced no output`);
  return JSON.parse(line) as Record<string, string>;
}

test.describe("Strategy Map canvas — real data and governance", () => {
  test.describe.configure({ mode: "serial" });
  let fixture: Fixture;

  test.beforeAll(async () => {
    const base = await runSeed("e2e-scorecard-seed.ts");
    const map = await runSeed("e2e-strategy-map-seed.ts");
    fixture = {
      scorecardId: base.scorecardId,
      revenueObjectiveId: map.revenueObjectiveId,
      csatObjectiveId: map.csatObjectiveId,
      bobId: map.approverUserId,
      extraObjectiveId: map.objectiveId,
      perspectiveId: map.perspectiveId,
    };
  });

  test("analyst adds an objective, reloads, submits a map change, another user approves, and a viewer sees the published result", async ({ browser }) => {
    test.setTimeout(120_000);

    const analyst = await browser.newContext();
    const page = await analyst.newPage();
    await loginAs(page, "member");
    await page.goto(`/strategy-maps/${fixture.scorecardId}`);
    await expect(page.getByTestId("map-canvas-page")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("add-objective-button")).toBeVisible();

    await page.getByTestId("add-objective-button").click();
    await page.getByTestId("existing-objective-select").selectOption(fixture.extraObjectiveId);
    await page.getByTestId("objective-perspective-select").selectOption(fixture.perspectiveId);
    await page.getByTestId("add-existing-objective").click();
    await expect(page.getByTestId(`map-objective-${fixture.extraObjectiveId}`)).toBeVisible();

    await page.reload();
    await expect(page.getByTestId(`map-objective-${fixture.extraObjectiveId}`)).toBeVisible();
    await page.getByTestId("add-objective-button").click();
    await expect(page.getByTestId("existing-objective-select").locator(`option[value="${fixture.extraObjectiveId}"]`)).toHaveCount(0);
    await page.getByRole("button", { name: "Close" }).click();

    await page.getByTestId("connect-nodes-button").click();
    await page.getByTestId("connect-strength-drives").click();
    await page.getByTestId(`map-objective-${fixture.csatObjectiveId}`).click();
    await page.getByTestId(`map-objective-${fixture.extraObjectiveId}`).click();
    await page.getByTestId("connect-nodes-button").click();

    await page.getByTestId(`map-objective-${fixture.extraObjectiveId}`).click();
    const connection = page.getByTestId("node-connections-list").locator('[data-testid^="map-link-"]');
    await expect(connection).toHaveCount(1);
    await expect(connection).toContainText("Drives");

    await connection.click();
    await expect(page.getByTestId(`map-objective-${fixture.csatObjectiveId}`)).toHaveCSS("opacity", "1");

    await page.getByTestId("approval-participant-id").fill(fixture.bobId);
    await page.getByTestId("submit-for-approval-button").click();
    const submitted = page.getByTestId("submitted-map-case");
    await expect(submitted).toBeVisible();
    const caseId = await submitted.getAttribute("data-case-id");
    const mapId = await submitted.getAttribute("data-map-id");
    if (!caseId || !mapId) throw new Error("Submitted map did not expose its case/map ids");
    await analyst.close();

    const approver = await browser.newContext();
    const approverPage = await approver.newPage();
    await loginAs(approverPage, "platform_administrator");
    await approverPage.goto(`/approvals/${caseId}`);
    await approverPage.getByTestId("approve-case").click();
    await expect(approverPage.getByTestId("decision-badge")).toContainText("Approved");
    await approver.close();

    const publisher = await browser.newContext();
    const publisherPage = await publisher.newPage();
    await loginAs(publisherPage, "member");
    await publisherPage.goto(`/strategy-maps/${fixture.scorecardId}`);
    await publisherPage.getByTestId("publish-map-id").fill(mapId);
    await publisherPage.getByTestId("publish-case-id").fill(caseId);
    await publisherPage.getByTestId("publish-map-button").click();
    await expect(publisherPage.getByTestId("map-notice")).toContainText("published");
    await publisher.close();

    const viewer = await browser.newContext();
    const viewerPage = await viewer.newPage();
    await loginAs(viewerPage, "executive_viewer");
    await viewerPage.goto(`/strategy-maps/${fixture.scorecardId}`);
    await expect(viewerPage.getByTestId("add-objective-button")).toHaveCount(0);
    await expect(viewerPage.getByTestId("connect-nodes-button")).toHaveCount(0);
    await expect(viewerPage.getByTestId(`map-objective-${fixture.extraObjectiveId}`)).toBeVisible();
    await viewerPage.getByTestId(`map-objective-${fixture.extraObjectiveId}`).click();
    await expect(viewerPage.getByTestId("node-connections-list").locator('[data-testid^="map-link-"]')).toHaveCount(1);
    await viewer.close();
  });

  test("administrator edits and deletes a hierarchy-backed map objective persistently", async ({ page }) => {
    await loginAs(page, "platform_administrator");
    await page.goto(`/strategy-maps/${fixture.scorecardId}`);
    const objective = page.getByTestId(`map-objective-${fixture.extraObjectiveId}`);
    await expect(objective).toBeVisible({ timeout: 15_000 });
    await objective.click();

    await page.getByTitle("Edit objective").click();
    const editDialog = page.getByRole("dialog", { name: "Edit objective" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("Objective Label").fill("Improve Strategic Pricing");
    await editDialog.getByLabel("Owner Name").fill("Morgan Reed");
    await editDialog.getByLabel(/Progress/).fill("73");
    await editDialog.getByLabel("Description").fill("Improve enterprise pricing discipline and margin quality.");
    await editDialog.getByRole("button", { name: "Save Changes" }).click();
    await expect(page.getByTestId("map-notice")).toContainText("updated and persisted");

    await page.reload();
    const renamedObjective = page.getByTestId(`map-objective-${fixture.extraObjectiveId}`);
    await expect(renamedObjective).toContainText("Improve Strategic Pricing");
    await renamedObjective.click();
    await expect(page.getByTestId("node-properties-panel")).toContainText("Morgan Reed");
    await expect(page.getByTestId("node-properties-panel")).toContainText("73%");
    await expect(page.getByTestId("node-properties-panel")).toContainText("Improve enterprise pricing discipline and margin quality.");

    await page.getByTitle("Delete objective").click();
    const deleteDialog = page.getByRole("dialog", { name: "Delete objective" });
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("map-notice")).toContainText("were deleted");
    await expect(page.getByTestId(`map-objective-${fixture.extraObjectiveId}`)).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId(`map-objective-${fixture.extraObjectiveId}`)).toHaveCount(0);
  });

  test("non-analyst direct writes are rejected server-side", async ({ page }) => {
    await loginAs(page, "executive_viewer");
    const linkResponse = await page.request.post(`${backendTrpc}/scorecard.map.draftLink`, {
      data: { json: { scorecardId: fixture.scorecardId, link: {
        fromObjectiveId: fixture.revenueObjectiveId,
        toObjectiveId: fixture.csatObjectiveId,
        strength: "weak",
      } } },
    });
    expect(linkResponse.status()).toBe(403);

    const placementResponse = await page.request.post(`${backendTrpc}/scorecard.map.placeObjective`, {
      data: { json: { perspectiveId: fixture.perspectiveId, objectiveNodeId: fixture.extraObjectiveId } },
    });
    expect(placementResponse.status()).toBe(403);
  });
});
