import type { PrismaService } from "../../database/prisma.service";
import {
  decimalToNumber,
  toKeyResultTypeView,
  toKpiFrequencyView,
  toKpiPolarityView,
} from "../registry/registry.mappers";

import { AiSuggestionError, AiThemeNotFoundError } from "./ai.errors";
import type {
  ThemeContextKpi,
  ThemeContextNode,
  ThemeContextOkr,
  ThemeSuggestionContext,
} from "./ai-suggestion.types";

/** Only what the builder needs from the traversal service, so tests can fake it. */
export interface ThemeTraversalReader {
  getAncestry(nodeId: string): Promise<
    Array<{ id: string; nameEn: string; nameAr: string; type: string }>
  >;
  getCascade(
    nodeId: string,
    maxDepth?: number,
  ): Promise<
    Array<{ id: string; nameEn: string; nameAr: string; type: string }>
  >;
}

/** Caps on how much context is handed to the model, so a large tree cannot
 * blow the prompt budget or the latency budget. */
const MAX_EXISTING_KPIS = 60;
const MAX_EXISTING_OKRS = 40;
const MAX_OBJECTIVES = 40;

/**
 * Node types reach this builder in two casings — Prisma's UPPER_SNAKE from a
 * direct read, and the traversal service's lowercase wire form. The context is
 * normalised to the lowercase wire form so the prompt and the DTO never show
 * two spellings of the same type.
 */
function toNode(node: {
  id: string;
  nameEn: string;
  nameAr: string;
  type: string;
}): ThemeContextNode {
  return {
    id: node.id,
    nameEn: node.nameEn,
    nameAr: node.nameAr,
    type: node.type.toLowerCase(),
  };
}

/**
 * Assembles the strategy-side view a theme-level suggestion needs.
 *
 * Reads span two modules on purpose. Strategy owns the hierarchy, Registry owns
 * KPIs and OKRs, and neither should learn about AI; this builder is the only
 * place that joins them, so the coupling stays in one file rather than being
 * smeared through the suggestion service.
 */
export class ThemeContextBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly traversal: ThemeTraversalReader,
  ) {}

  async build(themeNodeId: string): Promise<ThemeSuggestionContext> {
    const theme = await this.prisma.strategyNode.findUnique({
      where: { id: themeNodeId },
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        type: true,
        state: true,
      },
    });

    if (!theme || theme.type !== "THEME") {
      throw new AiThemeNotFoundError();
    }

    if (theme.state === "RETIRED") {
      throw new AiSuggestionError(
        "A retired theme cannot receive suggestions",
      );
    }

    // Ancestry and cascade are independent reads against the same tree.
    const [ancestry, cascade] = await Promise.all([
      this.traversal.getAncestry(themeNodeId),
      this.traversal.getCascade(themeNodeId),
    ]);

    const objectives = cascade
      .filter((node) => node.type === "objective")
      .slice(0, MAX_OBJECTIVES)
      .map(toNode);

    const scopeNodeIds = [
      themeNodeId,
      ...cascade.map((node) => node.id),
    ];

    const [existingOkrs, existingKpis] = await Promise.all([
      this.loadOkrs(objectives.map((objective) => objective.id)),
      this.loadKpis(scopeNodeIds),
    ]);

    return {
      theme: toNode(theme),
      ancestry: ancestry.map(toNode),
      objectives,
      existingOkrs,
      existingKpis,
    };
  }

  private async loadOkrs(
    objectiveNodeIds: readonly string[],
  ): Promise<ThemeContextOkr[]> {
    if (objectiveNodeIds.length === 0) {
      return [];
    }

    const okrs = await this.prisma.okr.findMany({
      where: { objectiveNodeId: { in: [...objectiveNodeIds] } },
      include: { keyResults: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
      take: MAX_EXISTING_OKRS,
    });

    return okrs.map((okr) => ({
      id: okr.id,
      objectiveNodeId: okr.objectiveNodeId,
      nameEn: okr.nameEn,
      nameAr: okr.nameAr,
      keyResults: okr.keyResults.map((keyResult) => ({
        type: toKeyResultTypeView(keyResult.type),
        targetValue: decimalToNumber(keyResult.targetValue),
        unit: keyResult.unit,
        titleEn: keyResult.titleEn,
      })),
    }));
  }

  /**
   * KPIs reachable from the theme, through the alignment table.
   *
   * A KPI is described by its active version when it has one, and by its newest
   * draft otherwise — the same rule `KpiRegistryService.list` applies, so the
   * model sees the same wording the library shows.
   */
  private async loadKpis(
    scopeNodeIds: readonly string[],
  ): Promise<ThemeContextKpi[]> {
    const alignments = await this.prisma.alignment.findMany({
      where: { strategyNodeId: { in: [...scopeNodeIds] } },
      select: { kpiDefinitionId: true },
    });

    const definitionIds = [
      ...new Set(alignments.map((alignment) => alignment.kpiDefinitionId)),
    ];

    if (definitionIds.length === 0) {
      return [];
    }

    const definitions = await this.prisma.kpiDefinition.findMany({
      where: { id: { in: definitionIds }, status: { not: "RETIRED" } },
      include: {
        activeVersion: true,
        versions: { orderBy: { version: "desc" }, take: 1 },
      },
      orderBy: { createdAt: "asc" },
      take: MAX_EXISTING_KPIS,
    });

    return definitions.flatMap((definition) => {
      const version = definition.activeVersion ?? definition.versions[0];

      if (!version) {
        return [];
      }

      return [
        {
          kpiDefinitionId: definition.id,
          nameEn: version.nameEn,
          nameAr: version.nameAr,
          descriptionEn: version.descriptionEn,
          unit: version.unit,
          frequency: toKpiFrequencyView(version.frequency),
          polarity: toKpiPolarityView(version.polarity),
        },
      ];
    });
  }
}
