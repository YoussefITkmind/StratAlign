import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PrismaService } from "../../src/database/prisma.service";
import { RulesService } from "../../src/modules/rules/rules.service";
import { AlignmentService } from "../../src/modules/registry/alignment.service";
import { KpiHierarchyService } from "../../src/modules/registry/kpi-hierarchy.service";
import { KpiRegistryService } from "../../src/modules/registry/kpi-registry.service";
import { OkrService } from "../../src/modules/registry/okr.service";
import { UnavailableApprovalGateway } from "../../src/modules/registry/gateways/approval.gateway";
import {
  RegistryApprovalError,
  RegistryOperationError,
} from "../../src/modules/registry/registry.errors";
import type { CreateKpiDraftInput } from "../../src/modules/registry/kpi-registry.service";
import {
  FakeApprovalGateway,
  FakeStrategyNodeGateway,
} from "./support/registry-fakes";

/**
 * Runs the committed migrations through the Prisma CLI's JavaScript entry
 * point with the current Node binary, rather than spawning the `pnpm` or
 * `prisma` shim — those are `.cmd` files on Windows, which Node refuses to
 * spawn without a shell. `test-services.ts` resolves it the same way.
 */
function applyMigrations(databaseUrl: string): void {
  const require = createRequire(import.meta.url);

  execFileSync(
    process.execPath,
    [require.resolve("prisma/build/index.js"), "migrate", "deploy"],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl },
      stdio: "pipe",
    },
  );
}

describe.sequential(
  "registry with real migrations and PostgreSQL Testcontainers",
  () => {
    let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
    let prisma: PrismaService;
    let approvals: FakeApprovalGateway;
    let strategyNodes: FakeStrategyNodeGateway;
    let kpis: KpiRegistryService;
    let okrs: OkrService;
    let alignments: AlignmentService;
    let hierarchy: KpiHierarchyService;
    let rules: RulesService;
    let ownerUserId: string;
    let rollupRuleId: string;
    let thresholdRuleId: string;

    beforeAll(async () => {
      postgres = await new PostgreSqlContainer("postgres:17-alpine")
        .withDatabase("spm_registry_test")
        .withUsername("spm_test")
        .withPassword("spm_test_password")
        .start();

      applyMigrations(postgres.getConnectionUri());

      prisma = new PrismaService(postgres.getConnectionUri());
      await prisma.connect();

      const owner = await prisma.user.create({
        data: {
          email: "kpi-owner@example.test",
          displayName: "KPI Owner",
        },
      });

      ownerUserId = owner.id;
      rules = new RulesService(prisma);

      // Rollup rules come from the existing Rules module rather than being
      // faked, so the hierarchy type check is exercised against real rows.
      const rollupDraft = await rules.createDraft({
        ruleKey: "kpi-sum-rollup",
        name: "KPI Sum Rollup",
        createdBy: ownerUserId,
        document: { ruleType: "rollup", method: "sum" },
      });
      rollupRuleId = (await rules.publish(rollupDraft.id)).id;

      const thresholdDraft = await rules.createDraft({
        ruleKey: "kpi-threshold",
        name: "KPI Threshold",
        createdBy: ownerUserId,
        document: {
          ruleType: "threshold_status",
          direction: "higher_is_better",
          bands: [
            {
              label: "On track",
              color: "green",
              comparator: "gte",
              value: 90,
            },
          ],
        },
      });
      thresholdRuleId = (await rules.publish(thresholdDraft.id)).id;
    }, 180_000);

    afterAll(async () => {
      await prisma?.disconnect();
      await postgres?.stop();
    }, 60_000);

    beforeEach(async () => {
      // Registry tables only: users and rule definitions are shared fixtures
      // created once in beforeAll.
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE
           "registry"."kpi_hierarchy_nodes",
           "registry"."alignments",
           "registry"."key_results",
           "registry"."okrs",
           "registry"."kpi_definitions",
           "registry"."kpi_versions"
         RESTART IDENTITY CASCADE`,
      );

      approvals = new FakeApprovalGateway();
      strategyNodes = new FakeStrategyNodeGateway();
      kpis = new KpiRegistryService(prisma, approvals, strategyNodes);
      okrs = new OkrService(prisma, strategyNodes);
      alignments = new AlignmentService(prisma, strategyNodes);
      hierarchy = new KpiHierarchyService(prisma);
    });

    function draftInput(
      overrides: Partial<CreateKpiDraftInput> = {},
    ): CreateKpiDraftInput {
      return {
        nameEn: "Customer Satisfaction Index",
        nameAr: "مؤشر رضا العملاء",
        descriptionEn: "Average satisfaction across all service channels",
        descriptionAr: "متوسط الرضا عبر جميع قنوات الخدمة",
        unit: "%",
        polarity: "higher_is_better",
        frequency: "monthly",
        dataSourceType: "manual",
        ownerUserId,
        activeFrom: new Date("2026-01-01T00:00:00.000Z"),
        ...overrides,
      };
    }

    /** Drafts and publishes a KPI through an approved case. */
    async function publishNewKpi(
      overrides: Partial<CreateKpiDraftInput> = {},
    ) {
      const draft = await kpis.createDraft(draftInput(overrides));
      approvals.approve("case-1", draft.definition.id);

      return kpis.publishVersion({
        kpiVersionId: draft.version.id,
        approvalCaseId: "case-1",
      });
    }

    describe("versioning", () => {
      it("appends versions against one stable definition id", async () => {
        const first = await publishNewKpi();

        const second = await kpis.createDraft(
          draftInput({
            kpiDefinitionId: first.definition.id,
            nameEn: "Customer Satisfaction Index (revised)",
          }),
        );

        expect(second.definition.id).toBe(first.definition.id);
        expect(second.version.version).toBe(2);
        expect(first.version.version).toBe(1);

        const versions = await kpis.listVersions(first.definition.id);
        expect(versions.map((version) => version.version)).toEqual([1, 2]);
      });

      it("moves the active pointer on publish and links the chain", async () => {
        const first = await publishNewKpi();

        expect(first.definition.activeVersionId).toBe(first.version.id);
        expect(first.definition.status).toBe("active");
        expect(first.version.supersedesVersionId).toBeNull();

        const draft = await kpis.createDraft(
          draftInput({
            kpiDefinitionId: first.definition.id,
            nameEn: "Customer Satisfaction Index v2",
          }),
        );

        // Pointer stays on v1 while v2 is only a draft.
        const midway = await prisma.kpiDefinition.findUniqueOrThrow({
          where: { id: first.definition.id },
        });
        expect(midway.activeVersionId).toBe(first.version.id);

        approvals.approve("case-2", first.definition.id);
        const second = await kpis.publishVersion({
          kpiVersionId: draft.version.id,
          approvalCaseId: "case-2",
        });

        expect(second.definition.activeVersionId).toBe(second.version.id);
        expect(second.version.supersedesVersionId).toBe(first.version.id);
      });

      it("refuses a second open draft for the same KPI", async () => {
        const first = await publishNewKpi();

        await kpis.createDraft(
          draftInput({ kpiDefinitionId: first.definition.id }),
        );

        await expect(
          kpis.createDraft(
            draftInput({ kpiDefinitionId: first.definition.id }),
          ),
        ).rejects.toBeInstanceOf(RegistryOperationError);
      });

      it("rejects any attempt to modify a published version", async () => {
        const published = await publishNewKpi();

        await expect(
          prisma.$executeRaw`
            UPDATE "registry"."kpi_versions"
            SET "name_en" = 'Rewritten'
            WHERE "id" = ${published.version.id}
          `,
        ).rejects.toThrow(/append-only/i);

        const unchanged = await prisma.kpiVersion.findUniqueOrThrow({
          where: { id: published.version.id },
        });
        expect(unchanged.nameEn).toBe("Customer Satisfaction Index");
      });

      it("rejects deletion of version history", async () => {
        const published = await publishNewKpi();

        await expect(
          prisma.$executeRaw`
            DELETE FROM "registry"."kpi_versions"
            WHERE "id" = ${published.version.id}
          `,
        ).rejects.toThrow(/append-only/i);
      });

      it("treats publication stamps as write-once", async () => {
        const published = await publishNewKpi();

        await expect(
          prisma.$executeRaw`
            UPDATE "registry"."kpi_versions"
            SET "approval_case_id" = 'forged-case'
            WHERE "id" = ${published.version.id}
          `,
        ).rejects.toThrow(/write-once/i);
      });
    });

    describe("approval-gated publication", () => {
      it("publishes when the workflow case is approved", async () => {
        const draft = await kpis.createDraft(draftInput());
        approvals.approve("case-ok", draft.definition.id);

        const published = await kpis.publishVersion({
          kpiVersionId: draft.version.id,
          approvalCaseId: "case-ok",
        });

        expect(published.version.publishedAt).not.toBeNull();
        expect(published.version.approvalCaseId).toBe("case-ok");
        expect(approvals.checks).toEqual([
          {
            approvalCaseId: "case-ok",
            subjectType: "KpiDefinition",
            subjectId: draft.definition.id,
          },
        ]);
      });

      it("refuses to publish when the case is not approved", async () => {
        const draft = await kpis.createDraft(draftInput());

        await expect(
          kpis.publishVersion({
            kpiVersionId: draft.version.id,
            approvalCaseId: "never-approved",
          }),
        ).rejects.toBeInstanceOf(RegistryApprovalError);

        const stored = await prisma.kpiVersion.findUniqueOrThrow({
          where: { id: draft.version.id },
        });
        expect(stored.publishedAt).toBeNull();

        const definition = await prisma.kpiDefinition.findUniqueOrThrow({
          where: { id: draft.definition.id },
        });
        expect(definition.activeVersionId).toBeNull();
        expect(definition.status).toBe("DRAFT");
      });

      it("refuses when the case governs a different KPI", async () => {
        const [first, second] = await Promise.all([
          kpis.createDraft(draftInput()),
          kpis.createDraft(draftInput({ nameEn: "Other KPI" })),
        ]);

        approvals.approve("case-first", first.definition.id);

        await expect(
          kpis.publishVersion({
            kpiVersionId: second.version.id,
            approvalCaseId: "case-first",
          }),
        ).rejects.toBeInstanceOf(RegistryApprovalError);
      });

      it("refuses to publish the same version twice", async () => {
        const published = await publishNewKpi();

        await expect(
          kpis.publishVersion({
            kpiVersionId: published.version.id,
            approvalCaseId: "case-1",
          }),
        ).rejects.toBeInstanceOf(RegistryOperationError);
      });

      it("cannot be published at all through the production gateway", async () => {
        const production = new KpiRegistryService(
          prisma,
          new UnavailableApprovalGateway(),
          strategyNodes,
        );

        const draft = await production.createDraft(draftInput());

        await expect(
          production.publishVersion({
            kpiVersionId: draft.version.id,
            approvalCaseId: "any-case",
          }),
        ).rejects.toBeInstanceOf(RegistryApprovalError);
      });
    });

    describe("retirement", () => {
      it("retires without erasing history", async () => {
        const published = await publishNewKpi();

        const retired = await kpis.retire(published.definition.id);

        expect(retired.status).toBe("retired");
        expect(retired.retiredAt).not.toBeNull();
        // The pointer survives so historical reads still resolve.
        expect(retired.activeVersionId).toBe(published.version.id);

        const versions = await kpis.listVersions(published.definition.id);
        expect(versions).toHaveLength(1);
      });

      it("reports alignment and hierarchy impact", async () => {
        const parent = await publishNewKpi();
        const child = await publishNewKpi({
          nameEn: "Complaint Resolution Rate",
          nameAr: "معدل حل الشكاوى",
        });

        await alignments.set({
          kpiDefinitionId: parent.definition.id,
          alignments: [
            { strategyNodeId: "node-obj-1", alignmentType: "objective" },
            { strategyNodeId: "node-sector-3", alignmentType: "sector" },
          ],
        });

        await hierarchy.setRollup({
          parentKpiId: parent.definition.id,
          childKpiId: child.definition.id,
          rollupMethodRuleId: rollupRuleId,
        });

        const impact = await kpis.retirementImpact(parent.definition.id);

        expect(impact.affectedAlignments).toHaveLength(2);
        expect(impact.affectedStrategyNodeIds.sort()).toEqual([
          "node-obj-1",
          "node-sector-3",
        ]);
        expect(impact.affectedHierarchyEdges).toHaveLength(1);
        // Nothing has confirmed those strategy nodes exist.
        expect(impact.strategyNodesVerified).toBe(false);
      });

      it("reports verification honestly when an adapter can verify", async () => {
        const verifying = new FakeStrategyNodeGateway(true);
        verifying.register("node-obj-1");

        const service = new KpiRegistryService(
          prisma,
          approvals,
          verifying,
        );
        const published = await publishNewKpi();

        const impact = await service.retirementImpact(
          published.definition.id,
        );

        expect(impact.strategyNodesVerified).toBe(true);
      });

      it("refuses new versions and realignment once retired", async () => {
        const published = await publishNewKpi();
        await kpis.retire(published.definition.id);

        await expect(
          kpis.createDraft(
            draftInput({ kpiDefinitionId: published.definition.id }),
          ),
        ).rejects.toBeInstanceOf(RegistryOperationError);

        await expect(
          alignments.set({
            kpiDefinitionId: published.definition.id,
            alignments: [
              { strategyNodeId: "node-1", alignmentType: "objective" },
            ],
          }),
        ).rejects.toBeInstanceOf(RegistryOperationError);
      });
    });

    describe("duplicate detection via pg_trgm", () => {
      beforeEach(async () => {
        await publishNewKpi();
        await publishNewKpi({
          nameEn: "Employee Retention Rate",
          nameAr: "معدل الاحتفاظ بالموظفين",
          descriptionEn: "Share of employees remaining after twelve months",
          descriptionAr: "نسبة الموظفين الباقين بعد اثني عشر شهرا",
        });
      });

      it("finds near-duplicate English names and ranks them", async () => {
        const matches = await kpis.findSimilar({
          text: "Customer Satisfaction Indx",
        });

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].nameEn).toBe("Customer Satisfaction Index");
        expect(matches[0].rank).toBe(1);
        expect(matches[0].similarity).toBeGreaterThan(0.5);
        expect(
          matches[0].matchingFields.some(
            (field) => field.field === "nameEn",
          ),
        ).toBe(true);

        // Ranks are dense and ordered strongest first.
        expect(matches.map((match) => match.rank)).toEqual(
          matches.map((_, index) => index + 1),
        );
        for (let index = 1; index < matches.length; index += 1) {
          expect(matches[index - 1].similarity).toBeGreaterThanOrEqual(
            matches[index].similarity,
          );
        }
      });

      it("finds near-duplicate Arabic names", async () => {
        const matches = await kpis.findSimilar({
          text: "مؤشر رضا العملاء",
        });

        expect(matches.length).toBeGreaterThan(0);
        expect(matches[0].nameAr).toBe("مؤشر رضا العملاء");
        expect(matches[0].similarity).toBeGreaterThan(0.9);
        expect(
          matches[0].matchingFields.some(
            (field) => field.field === "nameAr",
          ),
        ).toBe(true);
      });

      it("matches on descriptions in both languages", async () => {
        const english = await kpis.findSimilar({
          text: "Share of employees remaining after twelve months",
        });
        expect(english[0].matchingFields[0].field).toBe("descriptionEn");

        const arabic = await kpis.findSimilar({
          text: "نسبة الموظفين الباقين بعد اثني عشر شهرا",
        });
        expect(arabic[0].matchingFields[0].field).toBe("descriptionAr");
      });

      it("returns nothing for unrelated text", async () => {
        const matches = await kpis.findSimilar({
          text: "quarterly budget variance for procurement",
        });

        expect(matches).toEqual([]);
      });

      it("excludes the KPI being edited", async () => {
        const all = await kpis.findSimilar({
          text: "Customer Satisfaction Index",
        });
        const target = all[0].kpiDefinitionId;

        const filtered = await kpis.findSimilar({
          text: "Customer Satisfaction Index",
          excludeKpiDefinitionId: target,
        });

        expect(
          filtered.some((match) => match.kpiDefinitionId === target),
        ).toBe(false);
      });

      it("considers only the newest version of a KPI", async () => {
        const original = await kpis.findSimilar({
          text: "Customer Satisfaction Index",
        });
        const definitionId = original[0].kpiDefinitionId;

        const draft = await kpis.createDraft(
          draftInput({
            kpiDefinitionId: definitionId,
            nameEn: "Client Delight Score",
            descriptionEn: "Renamed measure",
          }),
        );
        approvals.approve("case-rename", definitionId);
        await kpis.publishVersion({
          kpiVersionId: draft.version.id,
          approvalCaseId: "case-rename",
        });

        const byOldName = await kpis.findSimilar({
          text: "Customer Satisfaction Index",
        });
        expect(
          byOldName.some(
            (match) => match.kpiDefinitionId === definitionId,
          ),
        ).toBe(false);

        const byNewName = await kpis.findSimilar({
          text: "Client Delight Score",
        });
        expect(byNewName[0].kpiDefinitionId).toBe(definitionId);
        expect(byNewName[0].version).toBe(2);
      });
    });

    describe("hierarchy", () => {
      it("accepts a published rollup rule", async () => {
        const parent = await publishNewKpi();
        const child = await publishNewKpi({ nameEn: "Child KPI" });

        const edge = await hierarchy.setRollup({
          parentKpiId: parent.definition.id,
          childKpiId: child.definition.id,
          rollupMethodRuleId: rollupRuleId,
        });

        expect(edge.rollupMethodRuleId).toBe(rollupRuleId);
      });

      it("rejects a rule whose type is not rollup", async () => {
        const parent = await publishNewKpi();
        const child = await publishNewKpi({ nameEn: "Child KPI" });

        await expect(
          hierarchy.setRollup({
            parentKpiId: parent.definition.id,
            childKpiId: child.definition.id,
            rollupMethodRuleId: thresholdRuleId,
          }),
        ).rejects.toThrow(/type rollup/i);
      });

      it("rejects an unpublished rollup rule", async () => {
        const parent = await publishNewKpi();
        const child = await publishNewKpi({ nameEn: "Child KPI" });

        const unpublished = await rules.createDraft({
          ruleKey: `draft-rollup-${Date.now()}`,
          name: "Draft Rollup",
          createdBy: ownerUserId,
          document: { ruleType: "rollup", method: "average" },
        });

        await expect(
          hierarchy.setRollup({
            parentKpiId: parent.definition.id,
            childKpiId: child.definition.id,
            rollupMethodRuleId: unpublished.id,
          }),
        ).rejects.toThrow(/published rule/i);
      });

      it("rejects an unknown rule", async () => {
        const parent = await publishNewKpi();
        const child = await publishNewKpi({ nameEn: "Child KPI" });

        await expect(
          hierarchy.setRollup({
            parentKpiId: parent.definition.id,
            childKpiId: child.definition.id,
            rollupMethodRuleId: "00000000-0000-0000-0000-000000000000",
          }),
        ).rejects.toThrow(/not found/i);
      });

      it("rejects self-reference", async () => {
        const kpi = await publishNewKpi();

        await expect(
          hierarchy.setRollup({
            parentKpiId: kpi.definition.id,
            childKpiId: kpi.definition.id,
            rollupMethodRuleId: rollupRuleId,
          }),
        ).rejects.toThrow(/itself/i);
      });

      it("rejects an edge that would close a cycle", async () => {
        const a = await publishNewKpi({ nameEn: "KPI A" });
        const b = await publishNewKpi({ nameEn: "KPI B" });
        const c = await publishNewKpi({ nameEn: "KPI C" });

        await hierarchy.setRollup({
          parentKpiId: a.definition.id,
          childKpiId: b.definition.id,
          rollupMethodRuleId: rollupRuleId,
        });
        await hierarchy.setRollup({
          parentKpiId: b.definition.id,
          childKpiId: c.definition.id,
          rollupMethodRuleId: rollupRuleId,
        });

        await expect(
          hierarchy.setRollup({
            parentKpiId: c.definition.id,
            childKpiId: a.definition.id,
            rollupMethodRuleId: rollupRuleId,
          }),
        ).rejects.toThrow(/cycle/i);
      });

      it("re-points an existing edge rather than duplicating it", async () => {
        const parent = await publishNewKpi();
        const child = await publishNewKpi({ nameEn: "Child KPI" });

        const other = await rules.createDraft({
          ruleKey: `worst-of-rollup-${Date.now()}`,
          name: "Worst Of Rollup",
          createdBy: ownerUserId,
          document: {
            ruleType: "rollup",
            method: "worst_of",
            direction: "higher_is_better",
          },
        });
        const publishedOther = await rules.publish(other.id);

        const first = await hierarchy.setRollup({
          parentKpiId: parent.definition.id,
          childKpiId: child.definition.id,
          rollupMethodRuleId: rollupRuleId,
        });
        const second = await hierarchy.setRollup({
          parentKpiId: parent.definition.id,
          childKpiId: child.definition.id,
          rollupMethodRuleId: publishedOther.id,
        });

        expect(second.id).toBe(first.id);
        expect(second.rollupMethodRuleId).toBe(publishedOther.id);

        const edges = await hierarchy.listChildren(parent.definition.id);
        expect(edges).toHaveLength(1);
      });

      it("rejects a retired KPI", async () => {
        const parent = await publishNewKpi();
        const child = await publishNewKpi({ nameEn: "Child KPI" });
        await kpis.retire(child.definition.id);

        await expect(
          hierarchy.setRollup({
            parentKpiId: parent.definition.id,
            childKpiId: child.definition.id,
            rollupMethodRuleId: rollupRuleId,
          }),
        ).rejects.toThrow(/retired/i);
      });
    });

    describe("alignment", () => {
      it("replaces the alignment set declaratively", async () => {
        const kpi = await publishNewKpi();

        await alignments.set({
          kpiDefinitionId: kpi.definition.id,
          alignments: [
            { strategyNodeId: "node-1", alignmentType: "objective" },
            { strategyNodeId: "node-2", alignmentType: "play" },
          ],
        });

        const replaced = await alignments.set({
          kpiDefinitionId: kpi.definition.id,
          alignments: [
            { strategyNodeId: "node-3", alignmentType: "project" },
          ],
        });

        expect(replaced).toHaveLength(1);
        expect(replaced[0].strategyNodeId).toBe("node-3");
      });

      it("supports the same node under different alignment types", async () => {
        const kpi = await publishNewKpi();

        const result = await alignments.set({
          kpiDefinitionId: kpi.definition.id,
          alignments: [
            { strategyNodeId: "node-1", alignmentType: "objective" },
            { strategyNodeId: "node-1", alignmentType: "sector" },
          ],
        });

        expect(result).toHaveLength(2);
      });

      it("rejects duplicate entries in one call", async () => {
        const kpi = await publishNewKpi();

        await expect(
          alignments.set({
            kpiDefinitionId: kpi.definition.id,
            alignments: [
              { strategyNodeId: "node-1", alignmentType: "objective" },
              { strategyNodeId: "node-1", alignmentType: "objective" },
            ],
          }),
        ).rejects.toBeInstanceOf(RegistryOperationError);
      });

      it("clears alignments when given an empty set", async () => {
        const kpi = await publishNewKpi();

        await alignments.set({
          kpiDefinitionId: kpi.definition.id,
          alignments: [
            { strategyNodeId: "node-1", alignmentType: "objective" },
          ],
        });

        expect(
          await alignments.set({
            kpiDefinitionId: kpi.definition.id,
            alignments: [],
          }),
        ).toEqual([]);
      });

      it("leaves the previous set intact when the write fails", async () => {
        const kpi = await publishNewKpi();

        await alignments.set({
          kpiDefinitionId: kpi.definition.id,
          alignments: [
            { strategyNodeId: "node-keep", alignmentType: "objective" },
          ],
        });

        // A gateway that rejects proves the delete-then-insert never runs
        // partially: validation happens before the transaction opens.
        const verifying = new FakeStrategyNodeGateway(true);
        const guarded = new AlignmentService(prisma, verifying);

        await expect(
          guarded.set({
            kpiDefinitionId: kpi.definition.id,
            alignments: [
              { strategyNodeId: "node-unknown", alignmentType: "play" },
            ],
          }),
        ).rejects.toThrow();

        const surviving = await alignments.listForKpi(kpi.definition.id);
        expect(surviving).toHaveLength(1);
        expect(surviving[0].strategyNodeId).toBe("node-keep");
      });

      it("finds every KPI aligned to a strategy node", async () => {
        const first = await publishNewKpi();
        const second = await publishNewKpi({ nameEn: "Second KPI" });

        await alignments.set({
          kpiDefinitionId: first.definition.id,
          alignments: [
            { strategyNodeId: "shared-node", alignmentType: "objective" },
          ],
        });
        await alignments.set({
          kpiDefinitionId: second.definition.id,
          alignments: [
            { strategyNodeId: "shared-node", alignmentType: "sector" },
          ],
        });

        expect(
          await alignments.listForStrategyNode("shared-node"),
        ).toHaveLength(2);
      });
    });

    describe("OKRs", () => {
      it("creates an OKR with its key results atomically", async () => {
        const okr = await okrs.create({
          objectiveNodeId: "node-objective-1",
          nameEn: "Improve service quality",
          nameAr: "تحسين جودة الخدمة",
          keyResults: [
            { type: "quantitative", targetValue: 95, unit: "%" },
            { type: "milestone", targetValue: 1, unit: "milestone" },
          ],
        });

        expect(okr.keyResults).toHaveLength(2);
        expect(okr.keyResults[0].targetValue).toBe(95);
        expect(okr.keyResults[0].currentValue).toBeNull();
        expect(okr.keyResults[0].progressPercent).toBeNull();
      });

      it("rejects an OKR with no key results", async () => {
        await expect(
          okrs.create({
            objectiveNodeId: "node-objective-1",
            nameEn: "Empty",
            nameAr: "فارغ",
            keyResults: [],
          }),
        ).rejects.toBeInstanceOf(RegistryOperationError);

        expect(await prisma.okr.count()).toBe(0);
      });

      it("records progress and derives a percentage", async () => {
        const okr = await okrs.create({
          objectiveNodeId: "node-objective-1",
          nameEn: "Improve service quality",
          nameAr: "تحسين جودة الخدمة",
          keyResults: [
            { type: "quantitative", targetValue: 200, unit: "count" },
          ],
        });

        const updated = await okrs.updateProgress({
          keyResultId: okr.keyResults[0].id,
          currentValue: 50,
        });

        expect(updated.currentValue).toBe(50);
        expect(updated.progressPercent).toBe(25);
        expect(updated.progressUpdatedAt).not.toBeNull();
      });

      it("rejects progress for an unknown key result", async () => {
        await expect(
          okrs.updateProgress({
            keyResultId: "00000000-0000-0000-0000-000000000000",
            currentValue: 10,
          }),
        ).rejects.toBeInstanceOf(RegistryOperationError);
      });
    });

    describe("schema guarantees", () => {
      it("creates the trigram indexes the similarity search relies on", async () => {
        const indexes = await prisma.$queryRaw<
          Array<{ indexname: string; indexdef: string }>
        >`
          SELECT indexname, indexdef
          FROM pg_indexes
          WHERE schemaname = 'registry' AND tablename = 'kpi_versions'
        `;

        const trigram = indexes.filter((index) =>
          index.indexdef.includes("gin_trgm_ops"),
        );

        expect(trigram.map((index) => index.indexname).sort()).toEqual([
          "kpi_versions_description_ar_trgm_idx",
          "kpi_versions_description_en_trgm_idx",
          "kpi_versions_name_ar_trgm_idx",
          "kpi_versions_name_en_trgm_idx",
        ]);
      });

      it("indexes strategy node ids so impact queries stay cheap", async () => {
        const indexes = await prisma.$queryRaw<
          Array<{ indexdef: string }>
        >`
          SELECT indexdef
          FROM pg_indexes
          WHERE schemaname = 'registry' AND tablename = 'alignments'
        `;

        expect(
          indexes.some((index) =>
            index.indexdef.includes("strategy_node_id"),
          ),
        ).toBe(true);
      });

      it("has no foreign key onto tables other modules own", async () => {
        const constraints = await prisma.$queryRaw<
          Array<{ column_name: string }>
        >`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name = tc.constraint_name
           AND kcu.constraint_schema = tc.constraint_schema
          WHERE tc.constraint_schema = 'registry'
            AND tc.constraint_type = 'FOREIGN KEY'
        `;

        const columns = constraints.map((row) => row.column_name);

        expect(columns).not.toContain("strategy_node_id");
        expect(columns).not.toContain("objective_node_id");
        expect(columns).not.toContain("approval_case_id");
        // The rules module does exist, so this reference is a real key.
        expect(columns).toContain("rollup_method_rule_id");
      });

      it("enforces one open draft per KPI in the database", async () => {
        const published = await publishNewKpi();

        await prisma.kpiVersion.create({
          data: {
            kpiDefinitionId: published.definition.id,
            version: 2,
            nameEn: "Draft two",
            nameAr: "مسودة اثنين",
            unit: "%",
            polarity: "HIGHER_IS_BETTER",
            frequency: "MONTHLY",
            dataSourceType: "MANUAL",
            ownerUserId,
            activeFrom: new Date(),
          },
        });

        await expect(
          prisma.kpiVersion.create({
            data: {
              kpiDefinitionId: published.definition.id,
              version: 3,
              nameEn: "Draft three",
              nameAr: "مسودة ثلاثة",
              unit: "%",
              polarity: "HIGHER_IS_BETTER",
              frequency: "MONTHLY",
              dataSourceType: "MANUAL",
              ownerUserId,
              activeFrom: new Date(),
            },
          }),
        ).rejects.toThrow();
      });

      it("rejects a non-positive version number", async () => {
        const kpi = await prisma.kpiDefinition.create({ data: {} });

        await expect(
          prisma.$executeRaw`
            INSERT INTO "registry"."kpi_versions"
              ("id", "kpi_definition_id", "version", "name_en", "name_ar",
               "unit", "polarity", "frequency", "data_source_type",
               "owner_user_id", "active_from")
            VALUES
              (gen_random_uuid()::text, ${kpi.id}, 0, 'x', 'س', '%',
               'higher_is_better', 'monthly', 'manual', ${ownerUserId}, now())
          `,
        ).rejects.toThrow();
      });
    });

    describe("transactions", () => {
      it("serialises concurrent draft creation for one KPI", async () => {
        const published = await publishNewKpi();

        const outcomes = await Promise.allSettled([
          kpis.createDraft(
            draftInput({
              kpiDefinitionId: published.definition.id,
              nameEn: "Concurrent A",
            }),
          ),
          kpis.createDraft(
            draftInput({
              kpiDefinitionId: published.definition.id,
              nameEn: "Concurrent B",
            }),
          ),
        ]);

        const fulfilled = outcomes.filter(
          (outcome) => outcome.status === "fulfilled",
        );

        // Exactly one wins; the advisory lock and the partial unique index
        // both stand between these two calls.
        expect(fulfilled).toHaveLength(1);

        const versions = await kpis.listVersions(published.definition.id);
        expect(versions).toHaveLength(2);
      });

      it("rolls back the version stamp when the pointer update fails", async () => {
        const draft = await kpis.createDraft(draftInput());
        approvals.approve("case-x", draft.definition.id);

        // `active_version_id` is unique, so parking another definition on this
        // version makes the final pointer update fail. Publication stamps the
        // version first, so if the two statements were not one transaction the
        // version would be left published with no definition pointing at it.
        const squatter = await prisma.kpiDefinition.create({ data: {} });
        await prisma.kpiDefinition.update({
          where: { id: squatter.id },
          data: { activeVersionId: draft.version.id },
        });

        await expect(
          kpis.publishVersion({
            kpiVersionId: draft.version.id,
            approvalCaseId: "case-x",
          }),
        ).rejects.toBeInstanceOf(RegistryOperationError);

        const version = await prisma.kpiVersion.findUniqueOrThrow({
          where: { id: draft.version.id },
        });
        expect(version.publishedAt).toBeNull();
        expect(version.approvalCaseId).toBeNull();

        const definition = await prisma.kpiDefinition.findUniqueOrThrow({
          where: { id: draft.definition.id },
        });
        expect(definition.status).toBe("DRAFT");
        expect(definition.activeVersionId).toBeNull();
      });

      it("makes a KPI with history undeletable", async () => {
        const published = await publishNewKpi();

        // The cascade from kpi_definitions reaches kpi_versions, where the
        // append-only trigger refuses. Retirement, not deletion, is the only
        // way to take a KPI out of service.
        await expect(
          prisma.kpiDefinition.delete({
            where: { id: published.definition.id },
          }),
        ).rejects.toThrow(/append-only/i);

        expect(
          await prisma.kpiDefinition.count({
            where: { id: published.definition.id },
          }),
        ).toBe(1);
      });
    });
  },
);
