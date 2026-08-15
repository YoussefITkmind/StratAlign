import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { test, expect } from "@playwright/test";

import { loginAs } from "./utils";

const execFileAsync = promisify(execFile);
const workspaceRoot = resolve(__dirname, "../../..");
const backendTrpc = process.env.NEXT_PUBLIC_TRPC_URL ?? "http://localhost:4000/trpc";

interface ScorecardFixture {
  scorecardId: string;
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

async function frontendTrpcJson(page: import("@playwright/test").Page, procedure: string, input: unknown) {
  const response = await page.request.post(`/api/trpc/${procedure}`, { data: { json: input } });
  const body = await response.json();
  return { status: response.status(), body };
}

async function backendTrpcJson(page: import("@playwright/test").Page, procedure: string, input: unknown) {
  const response = await page.request.post(`${backendTrpc}/${procedure}`, { data: { json: input } });
  const body = await response.json();
  return { status: response.status(), body };
}

test.describe("Governance approvals — screen (real Prompt 1.5/3.1 data)", () => {
  test.describe.configure({ mode: "serial" }); // shared scorecard fixture, decided one case at a time

  let fixture: ScorecardFixture;

  test.beforeAll(async () => {
    fixture = await seedScorecardFixture();
  });

  test("propose a real weighting change, see the before/after/delta, approve as a different user, then publish and confirm 3.2's data reflects it", async ({ page }) => {
    test.setTimeout(90_000);

    // Analyst (alice) proposes a real weighting change via the canonical Prompt 3.1 backend API.
    await loginAs(page, "member");
    const proposed = await backendTrpcJson(page, "scorecard.weighting.propose", {
      scorecardId: fixture.scorecardId,
      draftWeights: { "84000000-0000-4000-8000-000000000011": 70, "84000000-0000-4000-8000-000000000012": 30 },
      activeFrom: new Date().toISOString(),
      approvalParticipantId: fixture.bobId,
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const caseId: string = proposed.body.result.data.json.id;
    expect(caseId).toMatch(/^[0-9a-f-]{36}$/i);

    // A genuinely different user (bob) sees it in their real pending queue.
    await page.context().clearCookies();
    await loginAs(page, "platform_administrator");
    await page.goto("/governance");
    await expect(page.getByTestId("governance-tab-approvals")).toBeVisible();

    const card = page.locator(`[data-testid="approval-card"][data-case-id="${caseId}"]`);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("data-entity-type", "scorecard_weighting");

    // The real before/after/delta table, not a generic or fabricated view.
    const diff = card.getByTestId("scorecard-weighting-diff");
    await expect(diff).toBeVisible();
    await expect(diff).toContainText("70");
    await expect(diff).toContainText("30");
    await expect(card.getByTestId("scorecard-weighting-score-delta")).toContainText("60");

    await card.getByTestId("decision-rationale").fill("Reweighting approved — customer perspective deprioritized this quarter.");
    await card.getByTestId("approve-case").click();
    await expect(card).toHaveCount(0);

    // The analyst returns to publish the approved structural change.
    await page.context().clearCookies();
    await loginAs(page, "member");
    const published = await backendTrpcJson(page, "scorecard.weighting.publish", { scorecardId: fixture.scorecardId, approvalCaseId: caseId });
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    // Verify the exact real data source Master Scorecard (Prompt 3.2) reads now reflects the published change.
    const previewGet = await page.request.get(`${backendTrpc}/scorecard.weighting.preview?input=${encodeURIComponent(JSON.stringify({
      json: { scorecardId: fixture.scorecardId, draftWeights: { "84000000-0000-4000-8000-000000000011": 70, "84000000-0000-4000-8000-000000000012": 30 } },
    }))}`);
    const previewBody = await previewGet.json();
    expect(previewGet.status(), JSON.stringify(previewBody)).toBe(200);
    expect(Math.round(previewBody.result.data.json.currentScore)).toBe(70);

    // The requirement is that the approved change is visible on the real Master Scorecard UI (Prompt 3.2), not just reflected in an API response.
    await page.goto(`/balanced-scorecards/${fixture.scorecardId}`);
    await expect(page.getByTestId("master-scorecard-page")).toBeVisible();
    await expect(page.getByTestId("overall-score")).toContainText("70");
    await expect(page.getByTestId("perspective-weight-84000000-0000-4000-8000-000000000011")).toContainText("70");
    await expect(page.getByTestId("perspective-weight-84000000-0000-4000-8000-000000000012")).toContainText("30");
  });

  test("the submitter cannot decide their own case, even by calling governance.decide directly", async ({ page }) => {
    await loginAs(page, "member"); // alice
    const proposed = await backendTrpcJson(page, "scorecard.weighting.propose", {
      scorecardId: fixture.scorecardId,
      draftWeights: { "84000000-0000-4000-8000-000000000011": 55, "84000000-0000-4000-8000-000000000012": 45 },
      activeFrom: new Date().toISOString(),
      approvalParticipantId: fixture.bobId,
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const caseId: string = proposed.body.result.data.json.id;

    const decision = await frontendTrpcJson(page, "governance.decide", { id: caseId, decision: "approved" });
    expect(decision.status).toBe(403);
  });

  test("reject with a captured rationale, then verify the real decision log via governance.getCase", async ({ page }) => {
    await loginAs(page, "member"); // alice
    const proposed = await backendTrpcJson(page, "scorecard.weighting.propose", {
      scorecardId: fixture.scorecardId,
      draftWeights: { "84000000-0000-4000-8000-000000000011": 40, "84000000-0000-4000-8000-000000000012": 60 },
      activeFrom: new Date().toISOString(),
      approvalParticipantId: fixture.bobId,
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const caseId: string = proposed.body.result.data.json.id;

    await page.context().clearCookies();
    await loginAs(page, "platform_administrator"); // bob
    await page.goto("/governance");
    const card = page.locator(`[data-testid="approval-card"][data-case-id="${caseId}"]`);
    await expect(card).toBeVisible();

    const rationale = "Rejected — the customer perspective weight increase isn't justified this cycle.";
    await card.getByTestId("decision-rationale").fill(rationale);
    await card.getByTestId("reject-case").click();
    await expect(card).toHaveCount(0);

    const getCase = await page.request.get(`/api/trpc/governance.getCase?input=${encodeURIComponent(JSON.stringify({ json: { id: caseId } }))}`);
    const caseBody = await getCase.json();
    expect(caseBody.result.data.json.status).toBe("rejected");
    expect(caseBody.result.data.json.decisionReason).toBe(rationale);
  });

  test("request changes with a captured rationale, then verify it's persisted via governance.getCase and the real Decision Log", async ({ page }) => {
    await loginAs(page, "member"); // alice
    const proposed = await backendTrpcJson(page, "scorecard.weighting.propose", {
      scorecardId: fixture.scorecardId,
      draftWeights: { "84000000-0000-4000-8000-000000000011": 45, "84000000-0000-4000-8000-000000000012": 55 },
      activeFrom: new Date().toISOString(),
      approvalParticipantId: fixture.bobId,
    });
    expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
    const caseId: string = proposed.body.result.data.json.id;

    await page.context().clearCookies();
    await loginAs(page, "platform_administrator"); // bob
    await page.goto("/governance");
    const card = page.locator(`[data-testid="approval-card"][data-case-id="${caseId}"]`);
    await expect(card).toBeVisible();

    const rationale = "Add the customer-impact justification before this can move forward.";
    await card.getByTestId("decision-rationale").fill(rationale);
    await card.getByTestId("request-changes-case").click();
    await expect(card).toHaveCount(0);

    const getCase = await page.request.get(`/api/trpc/governance.getCase?input=${encodeURIComponent(JSON.stringify({ json: { id: caseId } }))}`);
    const caseBody = await getCase.json();
    expect(caseBody.result.data.json.status).toBe("changes_requested");
    expect(caseBody.result.data.json.decisionReason).toBe(rationale);

    // And the real Decision Log tab (not mock data) shows it too.
    await page.goto("/governance");
    await page.getByTestId("governance-tab-decision-log").click();
    const logEntry = page.locator('[data-testid="decision-log-entry"]', { hasText: rationale });
    await expect(logEntry).toBeVisible();
    await expect(logEntry).toContainText("Changes Requested");
  });
});
