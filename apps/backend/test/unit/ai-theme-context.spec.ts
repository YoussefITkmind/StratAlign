import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiThemeNotFoundError, AiSuggestionError } from "../../src/modules/ai/ai.errors";
import { ThemeContextBuilder } from "../../src/modules/ai/theme-context.builder";
import type { PrismaService } from "../../src/database/prisma.service";
import type { ThemeTraversalReader } from "../../src/modules/ai/theme-context.builder";

/**
 * The context builder is the only place Strategy and Registry data are joined,
 * so these tests pin down exactly what the model is allowed to be told: the
 * theme, its ancestry, its objectives, and the OKRs and KPIs already hanging
 * off them. Anything missing must degrade to an empty list rather than throw —
 * a theme with no children is a perfectly ordinary starting point.
 */

const THEME_ID = "11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "22222222-2222-4222-8222-222222222222";
const PLAY_ID = "33333333-3333-4333-8333-333333333333";
const KPI_ID = "44444444-4444-4444-8444-444444444444";

function decimal(value: number) {
  return { toNumber: () => value } as never;
}

interface PrismaStub {
  strategyNode: { findUnique: ReturnType<typeof vi.fn> };
  okr: { findMany: ReturnType<typeof vi.fn> };
  alignment: { findMany: ReturnType<typeof vi.fn> };
  kpiDefinition: { findMany: ReturnType<typeof vi.fn> };
}

function makePrisma(): PrismaStub {
  return {
    strategyNode: { findUnique: vi.fn() },
    okr: { findMany: vi.fn() },
    alignment: { findMany: vi.fn() },
    kpiDefinition: { findMany: vi.fn() },
  };
}

function makeTraversal(): ThemeTraversalReader & {
  getAncestry: ReturnType<typeof vi.fn>;
  getCascade: ReturnType<typeof vi.fn>;
} {
  return {
    getAncestry: vi.fn().mockResolvedValue([]),
    getCascade: vi.fn().mockResolvedValue([]),
  } as never;
}

describe("theme suggestion context", () => {
  let prisma: PrismaStub;
  let traversal: ReturnType<typeof makeTraversal>;
  let builder: ThemeContextBuilder;

  beforeEach(() => {
    prisma = makePrisma();
    traversal = makeTraversal();
    builder = new ThemeContextBuilder(
      prisma as unknown as PrismaService,
      traversal,
    );

    prisma.strategyNode.findUnique.mockResolvedValue({
      id: THEME_ID,
      nameEn: "Revenue & Growth",
      nameAr: "الإيرادات والنمو",
      type: "THEME",
      state: "ACTIVE",
    });
    prisma.okr.findMany.mockResolvedValue([]);
    prisma.alignment.findMany.mockResolvedValue([]);
    prisma.kpiDefinition.findMany.mockResolvedValue([]);
  });

  it("collects the theme itself with a normalised node type", async () => {
    const context = await builder.build(THEME_ID);

    expect(context.theme).toEqual({
      id: THEME_ID,
      nameEn: "Revenue & Growth",
      nameAr: "الإيرادات والنمو",
      // Read straight from Prisma as "THEME"; the context must not show two
      // spellings of the same type.
      type: "theme",
    });
  });

  it("includes the theme's position in the strategy hierarchy", async () => {
    traversal.getAncestry.mockResolvedValue([
      { id: "root", nameEn: "Corporate Strategy", nameAr: "الاستراتيجية", type: "corporate_strategy" },
      { id: "growth", nameEn: "Growth Strategy", nameAr: "النمو", type: "theme" },
    ]);

    const context = await builder.build(THEME_ID);

    expect(context.ancestry.map((node) => node.nameEn)).toEqual([
      "Corporate Strategy",
      "Growth Strategy",
    ]);
    expect(traversal.getAncestry).toHaveBeenCalledWith(THEME_ID);
  });

  it("exposes only objective descendants as OKR anchors", async () => {
    traversal.getCascade.mockResolvedValue([
      { id: OBJECTIVE_ID, nameEn: "Achieve $60M ARR", nameAr: "ARR", type: "objective" },
      { id: PLAY_ID, nameEn: "Enterprise Play", nameAr: "خطة", type: "strategic_play" },
    ]);

    const context = await builder.build(THEME_ID);

    expect(context.objectives).toHaveLength(1);
    expect(context.objectives[0].id).toBe(OBJECTIVE_ID);
  });

  it("includes existing OKRs and their key results", async () => {
    traversal.getCascade.mockResolvedValue([
      { id: OBJECTIVE_ID, nameEn: "Achieve $60M ARR", nameAr: "ARR", type: "objective" },
    ]);
    prisma.okr.findMany.mockResolvedValue([
      {
        id: "okr-1",
        objectiveNodeId: OBJECTIVE_ID,
        nameEn: "Drive Revenue Growth 40% YoY",
        nameAr: "نمو",
        keyResults: [
          {
            type: "QUANTITATIVE",
            titleEn: "Grow ARR",
            targetValue: decimal(60),
            unit: "$M",
          },
        ],
      },
    ]);

    const context = await builder.build(THEME_ID);

    expect(prisma.okr.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { objectiveNodeId: { in: [OBJECTIVE_ID] } },
      }),
    );
    expect(context.existingOkrs[0].nameEn).toBe("Drive Revenue Growth 40% YoY");
    expect(context.existingOkrs[0].keyResults[0]).toEqual({
      type: "quantitative",
      titleEn: "Grow ARR",
      targetValue: 60,
      unit: "$M",
    });
  });

  it("includes existing KPIs aligned anywhere in the theme's subtree", async () => {
    traversal.getCascade.mockResolvedValue([
      { id: PLAY_ID, nameEn: "Enterprise Play", nameAr: "خطة", type: "strategic_play" },
    ]);
    prisma.alignment.findMany.mockResolvedValue([
      { kpiDefinitionId: KPI_ID },
      // The same KPI aligned twice must not be described to the model twice.
      { kpiDefinitionId: KPI_ID },
    ]);
    prisma.kpiDefinition.findMany.mockResolvedValue([
      {
        id: KPI_ID,
        activeVersion: {
          nameEn: "Customer Retention Rate",
          nameAr: "معدل",
          descriptionEn: "Share of customers retained",
          unit: "%",
          frequency: "MONTHLY",
          polarity: "HIGHER_IS_BETTER",
        },
        versions: [],
      },
    ]);

    const context = await builder.build(THEME_ID);

    expect(prisma.alignment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { strategyNodeId: { in: [THEME_ID, PLAY_ID] } },
      }),
    );
    expect(prisma.kpiDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: [KPI_ID] }, status: { not: "RETIRED" } },
      }),
    );
    expect(context.existingKpis).toEqual([
      {
        kpiDefinitionId: KPI_ID,
        nameEn: "Customer Retention Rate",
        nameAr: "معدل",
        descriptionEn: "Share of customers retained",
        unit: "%",
        frequency: "monthly",
        polarity: "higher_is_better",
      },
    ]);
  });

  it("describes an unpublished KPI by its newest draft version", async () => {
    prisma.alignment.findMany.mockResolvedValue([{ kpiDefinitionId: KPI_ID }]);
    prisma.kpiDefinition.findMany.mockResolvedValue([
      {
        id: KPI_ID,
        activeVersion: null,
        versions: [
          {
            nameEn: "Draft KPI",
            nameAr: "مسودة",
            descriptionEn: null,
            unit: "x",
            frequency: "QUARTERLY",
            polarity: "LOWER_IS_BETTER",
          },
        ],
      },
    ]);

    const context = await builder.build(THEME_ID);

    expect(context.existingKpis[0].nameEn).toBe("Draft KPI");
    expect(context.existingKpis[0].frequency).toBe("quarterly");
  });

  it("returns empty collections rather than failing for a bare theme", async () => {
    const context = await builder.build(THEME_ID);

    expect(context.ancestry).toEqual([]);
    expect(context.objectives).toEqual([]);
    expect(context.existingOkrs).toEqual([]);
    expect(context.existingKpis).toEqual([]);
    // No objectives means no OKR read is worth issuing at all.
    expect(prisma.okr.findMany).not.toHaveBeenCalled();
  });

  it("refuses an unknown theme id", async () => {
    prisma.strategyNode.findUnique.mockResolvedValue(null);

    await expect(builder.build(THEME_ID)).rejects.toBeInstanceOf(
      AiThemeNotFoundError,
    );
  });

  it("refuses a node that exists but is not a theme", async () => {
    prisma.strategyNode.findUnique.mockResolvedValue({
      id: OBJECTIVE_ID,
      nameEn: "Achieve $60M ARR",
      nameAr: "ARR",
      type: "OBJECTIVE",
      state: "ACTIVE",
    });

    await expect(builder.build(OBJECTIVE_ID)).rejects.toBeInstanceOf(
      AiThemeNotFoundError,
    );
  });

  it("refuses a retired theme", async () => {
    prisma.strategyNode.findUnique.mockResolvedValue({
      id: THEME_ID,
      nameEn: "Old Theme",
      nameAr: "قديم",
      type: "THEME",
      state: "RETIRED",
    });

    await expect(builder.build(THEME_ID)).rejects.toBeInstanceOf(
      AiSuggestionError,
    );
  });
});
