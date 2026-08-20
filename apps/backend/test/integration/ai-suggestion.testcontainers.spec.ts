import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { PrismaService } from "../../src/database/prisma.service";
import { createLogger } from "../../src/logging/logger";
import { AiSuggestionService } from "../../src/modules/ai/ai-suggestion.service";
import { ThemeContextBuilder } from "../../src/modules/ai/theme-context.builder";
import { AlignmentService } from "../../src/modules/registry/alignment.service";
import { KpiRegistryService } from "../../src/modules/registry/kpi-registry.service";
import { OkrService } from "../../src/modules/registry/okr.service";
import { StrategyTraversalService } from "../../src/modules/strategy/strategy-traversal.service";
import {
  FakeApprovalGateway,
  FakeStrategyNodeGateway,
} from "./support/registry-fakes";

/**
 * The whole path against a real database: a real theme with a real hierarchy,
 * a stubbed model, and the registry's own services doing the creating.
 *
 * The model is the only thing faked. Everything that decides whether a record
 * exists — the trigram duplicate search, the alignment write, the provenance
 * unique key that makes accept idempotent — is exercised for real, because
 * those are exactly the behaviours an in-memory stub cannot prove.
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

function completion(payload: unknown) {
  return {
    text: JSON.stringify(payload),
    provider: "anthropic",
    model: "claude-sonnet-5",
    latencyMs: 10,
  };
}

describe.sequential(
  "AI suggestions with real migrations and PostgreSQL Testcontainers",
  () => {
    let postgres: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
    let prisma: PrismaService;
    let traversal: StrategyTraversalService;
    let service: AiSuggestionService;
    let complete: ReturnType<typeof vi.fn>;

    let actorUserId: string;
    let planVersionId: string;
    let themeId: string;
    let objectiveId: string;

    beforeAll(async () => {
      postgres = await new PostgreSqlContainer("postgres:17-alpine")
        .withDatabase("spm_ai_test")
        .start();

      const databaseUrl = postgres.getConnectionUri();
      applyMigrations(databaseUrl);

      prisma = new PrismaService(databaseUrl);
      await prisma.connect();
      traversal = new StrategyTraversalService(databaseUrl);

      complete = vi.fn();

      const kpis = new KpiRegistryService(
        prisma,
        new FakeApprovalGateway(),
        new FakeStrategyNodeGateway(),
      );

      service = new AiSuggestionService(
        prisma,
        new ThemeContextBuilder(prisma, traversal),
        {
          name: "anthropic",
          model: "claude-sonnet-5",
          isConfigured: true,
          complete,
        },
        kpis,
        new OkrService(prisma, new FakeStrategyNodeGateway()),
        new AlignmentService(prisma, new FakeStrategyNodeGateway()),
        // The outbox is written through the real Prisma client inside the
        // provenance transaction, so only the relay nudge is stubbed.
        {
          publishWithin: (tx, requests) =>
            tx.domainEvent
              .createMany({
                data: requests.map((request) => ({
                  eventType: request.eventType,
                  eventVersion: request.eventVersion,
                  aggregateType: request.aggregateType,
                  aggregateId: request.aggregateId,
                  dedupeKey: request.dedupeKey,
                  payload: request.payload,
                })),
                skipDuplicates: true,
              })
              .then((result) => result.count),
          nudgeRelay: () => Promise.resolve(),
        } as never,
        createLogger("error"),
      );
    }, 240_000);

    afterAll(async () => {
      await traversal?.destroy();
      await prisma?.disconnect();
      await postgres?.stop();
    });

    beforeEach(async () => {
      vi.clearAllMocks();

      // Truncate in dependency order so each test starts from a known tree.
      await prisma.$executeRawUnsafe(`
        TRUNCATE
          "registry"."ai_suggestion_provenance",
          "registry"."alignments",
          "registry"."key_results",
          "registry"."okrs",
          "registry"."kpi_versions",
          "registry"."kpi_definitions",
          "strategy"."strategy_edges",
          "strategy"."strategy_nodes",
          "strategy"."plan_versions",
          "public"."domain_events",
          "iam"."users"
        RESTART IDENTITY CASCADE
      `);

      const user = await prisma.user.create({
        data: { email: `owner-${randomUUID()}@example.test` },
      });
      actorUserId = user.id;

      const planVersion = await prisma.planVersion.create({
        data: { name: "FY26", status: "ACTIVE" },
      });
      planVersionId = planVersion.id;

      const corporate = await prisma.strategyNode.create({
        data: {
          type: "CORPORATE_STRATEGY",
          nameEn: "Corporate Strategy",
          nameAr: "الاستراتيجية",
          planVersionId,
          state: "ACTIVE",
          createdBy: actorUserId,
        },
      });

      const theme = await prisma.strategyNode.create({
        data: {
          type: "THEME",
          nameEn: "Revenue & Growth",
          nameAr: "الإيرادات والنمو",
          planVersionId,
          state: "ACTIVE",
          createdBy: actorUserId,
        },
      });
      themeId = theme.id;

      const objective = await prisma.strategyNode.create({
        data: {
          type: "OBJECTIVE",
          nameEn: "Achieve $60M ARR",
          nameAr: "ARR",
          planVersionId,
          state: "ACTIVE",
          createdBy: actorUserId,
        },
      });
      objectiveId = objective.id;

      await prisma.strategyEdge.createMany({
        data: [
          {
            fromNodeId: corporate.id,
            toNodeId: theme.id,
            edgeType: "CONTAINS",
            planVersionId,
          },
          {
            fromNodeId: theme.id,
            toNodeId: objective.id,
            edgeType: "CONTAINS",
            planVersionId,
          },
        ],
      });
    });

    function kpiSuggestionPayload(titleEn: string) {
      return {
        suggestions: [
          {
            type: "kpi",
            titleEn,
            titleAr: "نسبة",
            descriptionEn: "Acquisition efficiency.",
            descriptionAr: "الكفاءة",
            confidence: 0.88,
            rationale: "Nothing measures acquisition efficiency yet.",
            unit: "x",
            frequency: "quarterly",
            polarity: "higher_is_better",
          },
        ],
      };
    }

    it("builds theme context from the real hierarchy and existing records", async () => {
      await prisma.okr.create({
        data: {
          objectiveNodeId: objectiveId,
          nameEn: "Drive Revenue Growth 40% YoY",
          nameAr: "نمو",
          keyResults: {
            create: [
              {
                type: "QUANTITATIVE",
                titleEn: "Grow ARR",
                titleAr: "نمو",
                targetValue: 60,
                unit: "$M",
              },
            ],
          },
        },
      });

      complete.mockResolvedValue(completion({ suggestions: [] }));

      await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi", "okr"],
        maxSuggestions: 4,
      });

      const prompt = complete.mock.calls[0][0].prompt as string;
      expect(prompt).toContain("Revenue & Growth");
      expect(prompt).toContain("Corporate Strategy");
      expect(prompt).toContain("Achieve $60M ARR");
      expect(prompt).toContain(objectiveId);
      expect(prompt).toContain("Drive Revenue Growth 40% YoY");
      expect(prompt).toContain("Grow ARR -> 60 $M");
    });

    it("creates a real, aligned, traceable KPI when a suggestion is accepted", async () => {
      complete.mockResolvedValue(
        completion(kpiSuggestionPayload("LTV to CAC Ratio")),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });
      const [suggestion] = batch.suggestions;

      const accepted = await service.accept(
        {
          suggestionId: suggestion.suggestionId,
          generationId: suggestion.generationId,
          themeNodeId: themeId,
          kind: "kpi",
          titleEn: suggestion.titleEn,
          titleAr: suggestion.titleAr,
          descriptionEn: suggestion.descriptionEn,
          descriptionAr: suggestion.descriptionAr,
          confidence: suggestion.confidence,
          provider: batch.provider,
          model: batch.model,
          edited: false,
          kpi: suggestion.kpi,
        },
        actorUserId,
      );

      // A first-class KPI, indistinguishable in structure from a manual one.
      const created = await prisma.kpiDefinition.findUniqueOrThrow({
        where: { id: accepted.subjectId },
        include: { versions: true, alignments: true },
      });
      expect(created.status).toBe("DRAFT");
      expect(created.versions[0]).toMatchObject({
        nameEn: "LTV to CAC Ratio",
        unit: "x",
        frequency: "QUARTERLY",
        polarity: "HIGHER_IS_BETTER",
        ownerUserId: actorUserId,
      });

      // Aligned to the theme it was suggested for.
      expect(created.alignments).toHaveLength(1);
      expect(created.alignments[0]).toMatchObject({
        strategyNodeId: themeId,
        alignmentType: "THEME",
      });

      // And traceable back to the proposal that produced it.
      const provenance = await prisma.aiSuggestionProvenance.findUniqueOrThrow({
        where: { suggestionId: suggestion.suggestionId },
      });
      expect(provenance).toMatchObject({
        subjectType: "KPI_DEFINITION",
        subjectId: accepted.subjectId,
        themeNodeId: themeId,
        provider: "anthropic",
        model: "claude-sonnet-5",
        edited: false,
        acceptedById: actorUserId,
      });

      const event = await prisma.domainEvent.findFirstOrThrow({
        where: { eventType: "registry.ai_suggestion.accepted" },
      });
      expect(event.aggregateId).toBe(accepted.subjectId);
    });

    it("leaves a manually created KPI with no provenance row", async () => {
      const kpis = new KpiRegistryService(
        prisma,
        new FakeApprovalGateway(),
        new FakeStrategyNodeGateway(),
      );

      const manual = await kpis.createDraft({
        nameEn: "Hand-typed KPI",
        nameAr: "يدوي",
        unit: "%",
        polarity: "higher_is_better",
        frequency: "monthly",
        dataSourceType: "manual",
        ownerUserId: actorUserId,
        activeFrom: new Date(),
      });

      const provenance = await prisma.aiSuggestionProvenance.findFirst({
        where: { subjectId: manual.definition.id },
      });

      // This is what makes AI-originated records distinguishable at all.
      expect(provenance).toBeNull();
    });

    it("persists edited values and still records the item as AI-originated", async () => {
      complete.mockResolvedValue(
        completion(kpiSuggestionPayload("LTV to CAC Ratio")),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });
      const [suggestion] = batch.suggestions;

      const accepted = await service.accept(
        {
          suggestionId: suggestion.suggestionId,
          generationId: suggestion.generationId,
          themeNodeId: themeId,
          kind: "kpi",
          titleEn: "Increase enterprise ARR by 30%",
          titleAr: "زيادة",
          descriptionEn: suggestion.descriptionEn,
          descriptionAr: null,
          confidence: suggestion.confidence,
          provider: batch.provider,
          model: batch.model,
          edited: true,
          kpi: { unit: "%", frequency: "monthly", polarity: "higher_is_better" },
        },
        actorUserId,
      );

      const version = await prisma.kpiVersion.findFirstOrThrow({
        where: { kpiDefinitionId: accepted.subjectId },
      });
      expect(version.nameEn).toBe("Increase enterprise ARR by 30%");
      expect(version.unit).toBe("%");
      expect(version.frequency).toBe("MONTHLY");

      const provenance = await prisma.aiSuggestionProvenance.findUniqueOrThrow({
        where: { suggestionId: suggestion.suggestionId },
      });
      expect(provenance.edited).toBe(true);
    });

    it("creates a real OKR with its key results on the theme's objective", async () => {
      complete.mockResolvedValue(
        completion({
          suggestions: [
            {
              type: "okr",
              titleEn: "Expand into enterprise accounts",
              titleAr: "التوسع",
              confidence: 0.7,
              objectiveNodeId: objectiveId,
              keyResults: [
                {
                  titleEn: "Sign 20 enterprise logos",
                  titleAr: "توقيع",
                  type: "quantitative",
                  targetValue: 20,
                  unit: "logos",
                },
              ],
            },
          ],
        }),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["okr"],
        maxSuggestions: 4,
      });
      const [suggestion] = batch.suggestions;

      const accepted = await service.accept(
        {
          suggestionId: suggestion.suggestionId,
          generationId: suggestion.generationId,
          themeNodeId: themeId,
          kind: "okr",
          titleEn: suggestion.titleEn,
          titleAr: suggestion.titleAr,
          confidence: suggestion.confidence,
          provider: batch.provider,
          model: batch.model,
          edited: false,
          okr: suggestion.okr,
        },
        actorUserId,
      );

      const okr = await prisma.okr.findUniqueOrThrow({
        where: { id: accepted.subjectId },
        include: { keyResults: true },
      });
      expect(okr.objectiveNodeId).toBe(objectiveId);
      expect(okr.keyResults).toHaveLength(1);
      expect(okr.keyResults[0]).toMatchObject({
        titleEn: "Sign 20 enterprise logos",
        unit: "logos",
      });
      expect(okr.keyResults[0].targetValue.toNumber()).toBe(20);
    });

    it("flags a near-duplicate through the registry's real trigram search", async () => {
      const kpis = new KpiRegistryService(
        prisma,
        new FakeApprovalGateway(),
        new FakeStrategyNodeGateway(),
      );
      const existing = await kpis.createDraft({
        nameEn: "Customer Retention Rate",
        nameAr: "معدل الاحتفاظ بالعملاء",
        unit: "%",
        polarity: "higher_is_better",
        frequency: "monthly",
        dataSourceType: "manual",
        ownerUserId: actorUserId,
        activeFrom: new Date(),
      });

      complete.mockResolvedValue(
        completion(kpiSuggestionPayload("Customer Retention Rate")),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });
      const [suggestion] = batch.suggestions;

      expect(suggestion.duplicateMatches).toHaveLength(1);
      expect(suggestion.duplicateMatches[0]).toMatchObject({
        kpiDefinitionId: existing.definition.id,
        nameEn: "Customer Retention Rate",
      });
      expect(suggestion.duplicateMatches[0].similarity).toBeGreaterThanOrEqual(0.9);

      // And an unacknowledged accept of it creates nothing.
      const before = await prisma.kpiDefinition.count();
      await expect(
        service.accept(
          {
            suggestionId: suggestion.suggestionId,
            generationId: suggestion.generationId,
            themeNodeId: themeId,
            kind: "kpi",
            titleEn: suggestion.titleEn,
            titleAr: suggestion.titleAr,
            confidence: suggestion.confidence,
            provider: batch.provider,
            model: batch.model,
            edited: false,
            kpi: suggestion.kpi,
          },
          actorUserId,
        ),
      ).rejects.toThrow(/looks like an existing item/);
      expect(await prisma.kpiDefinition.count()).toBe(before);
    });

    it("re-accepting the same suggestion creates no second KPI", async () => {
      complete.mockResolvedValue(
        completion(kpiSuggestionPayload("Expansion ARR")),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });
      const [suggestion] = batch.suggestions;

      const payload = {
        suggestionId: suggestion.suggestionId,
        generationId: suggestion.generationId,
        themeNodeId: themeId,
        kind: "kpi" as const,
        titleEn: suggestion.titleEn,
        titleAr: suggestion.titleAr,
        confidence: suggestion.confidence,
        provider: batch.provider,
        model: batch.model,
        edited: false,
        kpi: suggestion.kpi,
      };

      const first = await service.accept(payload, actorUserId);
      const second = await service.accept(payload, actorUserId);

      expect(second.subjectId).toBe(first.subjectId);
      expect(second.alreadyAccepted).toBe(true);
      expect(await prisma.kpiDefinition.count()).toBe(1);
    });

    it("accept-all creates every valid item, and a retry adds nothing", async () => {
      complete.mockResolvedValue(
        completion({
          suggestions: [
            {
              type: "kpi",
              titleEn: "Expansion ARR",
              titleAr: "توسع",
              confidence: 0.8,
              unit: "$M",
              frequency: "quarterly",
              polarity: "higher_is_better",
            },
            {
              type: "kpi",
              titleEn: "Net Revenue Retention",
              titleAr: "صافي",
              confidence: 0.75,
              unit: "%",
              frequency: "monthly",
              polarity: "higher_is_better",
            },
          ],
        }),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });

      const payloads = batch.suggestions.map((suggestion) => ({
        suggestionId: suggestion.suggestionId,
        generationId: suggestion.generationId,
        themeNodeId: themeId,
        kind: "kpi" as const,
        titleEn: suggestion.titleEn,
        titleAr: suggestion.titleAr,
        confidence: suggestion.confidence,
        provider: batch.provider,
        model: batch.model,
        edited: false,
        kpi: suggestion.kpi,
      }));

      const first = await service.acceptMany(payloads, actorUserId);
      expect(first.accepted).toHaveLength(2);
      expect(first.failed).toEqual([]);
      expect(await prisma.kpiDefinition.count()).toBe(2);

      const retry = await service.acceptMany(payloads, actorUserId);
      expect(retry.accepted.every((item) => item.alreadyAccepted)).toBe(true);
      expect(await prisma.kpiDefinition.count()).toBe(2);
    });

    it("two concurrent accepts of one suggestion create exactly one KPI", async () => {
      complete.mockResolvedValue(
        completion(kpiSuggestionPayload("Concurrently Accepted KPI")),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });
      const [suggestion] = batch.suggestions;

      const payload = {
        suggestionId: suggestion.suggestionId,
        generationId: suggestion.generationId,
        themeNodeId: themeId,
        kind: "kpi" as const,
        titleEn: suggestion.titleEn,
        titleAr: suggestion.titleAr,
        confidence: suggestion.confidence,
        provider: batch.provider,
        model: batch.model,
        edited: false,
        kpi: suggestion.kpi,
      };

      // Fired together against a real PostgreSQL, so the unique index — not a
      // stubbed one — is what decides the winner.
      const [first, second] = await Promise.all([
        service.accept(payload, actorUserId),
        service.accept(payload, actorUserId),
      ]);

      expect(await prisma.kpiDefinition.count()).toBe(1);
      expect(await prisma.aiSuggestionProvenance.count()).toBe(1);
      expect(first.subjectId).toBe(second.subjectId);
      expect([first.alreadyAccepted, second.alreadyAccepted].sort()).toEqual([
        false,
        true,
      ]);

      const provenance = await prisma.aiSuggestionProvenance.findUniqueOrThrow({
        where: { suggestionId: suggestion.suggestionId },
      });
      expect(provenance.subjectId).toBe(first.subjectId);
    });

    it("two concurrent accepts of one OKR create exactly one OKR", async () => {
      complete.mockResolvedValue(
        completion({
          suggestions: [
            {
              type: "okr",
              titleEn: "Concurrently accepted objective",
              titleAr: "التوسع",
              confidence: 0.7,
              objectiveNodeId: objectiveId,
              keyResults: [
                {
                  titleEn: "Sign 20 enterprise logos",
                  titleAr: "توقيع",
                  type: "quantitative",
                  targetValue: 20,
                  unit: "logos",
                },
              ],
            },
          ],
        }),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["okr"],
        maxSuggestions: 4,
      });
      const [suggestion] = batch.suggestions;

      const payload = {
        suggestionId: suggestion.suggestionId,
        generationId: suggestion.generationId,
        themeNodeId: themeId,
        kind: "okr" as const,
        titleEn: suggestion.titleEn,
        titleAr: suggestion.titleAr,
        confidence: suggestion.confidence,
        provider: batch.provider,
        model: batch.model,
        edited: false,
        okr: suggestion.okr,
      };

      const [first, second] = await Promise.all([
        service.accept(payload, actorUserId),
        service.accept(payload, actorUserId),
      ]);

      expect(await prisma.okr.count()).toBe(1);
      expect(await prisma.keyResult.count()).toBe(1);
      expect(await prisma.aiSuggestionProvenance.count()).toBe(1);
      expect(first.subjectId).toBe(second.subjectId);
    });

    it("concurrent accept-all batches create each item exactly once", async () => {
      complete.mockResolvedValue(
        completion({
          suggestions: [
            {
              type: "kpi",
              titleEn: "Expansion ARR",
              titleAr: "توسع",
              confidence: 0.8,
              unit: "$M",
              frequency: "quarterly",
              polarity: "higher_is_better",
            },
            {
              type: "kpi",
              titleEn: "Net Revenue Retention",
              titleAr: "صافي",
              confidence: 0.75,
              unit: "%",
              frequency: "monthly",
              polarity: "higher_is_better",
            },
          ],
        }),
      );

      const batch = await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });

      const payloads = batch.suggestions.map((suggestion) => ({
        suggestionId: suggestion.suggestionId,
        generationId: suggestion.generationId,
        themeNodeId: themeId,
        kind: "kpi" as const,
        titleEn: suggestion.titleEn,
        titleAr: suggestion.titleAr,
        confidence: suggestion.confidence,
        provider: batch.provider,
        model: batch.model,
        edited: false,
        kpi: suggestion.kpi,
      }));

      // The double-submitted batch: a user clicking "Accept all" twice, or a
      // client retrying before the first response arrived.
      const [runA, runB] = await Promise.all([
        service.acceptMany(payloads, actorUserId),
        service.acceptMany(payloads, actorUserId),
      ]);

      expect(await prisma.kpiDefinition.count()).toBe(2);
      expect(await prisma.aiSuggestionProvenance.count()).toBe(2);
      expect(runA.accepted).toHaveLength(2);
      expect(runB.accepted).toHaveLength(2);
      expect(runA.failed).toEqual([]);
      expect(runB.failed).toEqual([]);
    });

    it("rejecting is the absence of an accept — nothing is written", async () => {
      complete.mockResolvedValue(
        completion(kpiSuggestionPayload("Never Accepted KPI")),
      );

      await service.generate({
        themeNodeId: themeId,
        kinds: ["kpi"],
        maxSuggestions: 4,
      });

      // The reviewer rejects, so no accept call is ever made.
      expect(await prisma.kpiDefinition.count()).toBe(0);
      expect(await prisma.okr.count()).toBe(0);
      expect(await prisma.aiSuggestionProvenance.count()).toBe(0);
    });

    it("refuses to build context for a node that is not a theme", async () => {
      await expect(
        service.generate({
          themeNodeId: objectiveId,
          kinds: ["kpi"],
          maxSuggestions: 4,
        }),
      ).rejects.toThrow("Theme was not found");

      expect(complete).not.toHaveBeenCalled();
    });
  },
  300_000,
);
