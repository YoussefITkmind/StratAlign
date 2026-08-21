import type { PrismaService } from "../../database/prisma.service";
import type { GovernanceService } from "../governance/governance.service";
import type { MeasurementService } from "../performance/measurement.service";
import type { RulesService } from "../rules/rules.service";
import { scorecardErrors } from "./scorecard.errors";
import {
  validateMapLink,
  validatePerspectiveWeights,
  type MapLinkInput,
  type PerspectiveWeights,
} from "./scorecard.validation";

const WEIGHTING_ENTITY = "scorecard_weighting";
const PERSPECTIVE_ENTITY = "scorecard_perspective";
const MAP_ENTITY = "strategy_map";

type ScorecardRow = {
  id: string;
  nameEn: string;
  nameAr: string;
  scopeNodeId: string | null;
  planVersionId: string;
  createdAt: Date;
};
type PerspectiveRow = { id: string; scorecardId: string; nameEn: string; nameAr: string; order: number };
type WeightingRow = {
  id: string;
  scorecardId: string;
  perspectiveWeights: unknown;
  scoringFormulaId: string;
  activeFrom: Date;
  supersedesId: string | null;
  approvalCaseId: string | null;
};
type MapRow = { id: string; scorecardId: string; state: "draft" | "published"; approvalCaseId: string | null; createdAt: Date };
type PlacementRow = { perspectiveId: string; objectiveNodeId: string };
type LinkRow = { id: string; strategyMapId: string; fromObjectiveId: string; toObjectiveId: string; strength: "weak" | "strong" };

type RagStatus = "on_track" | "watch" | "off_track";

export interface WeightingPreview {
  scorecardId: string;
  currentWeightingVersionId: string | null;
  scoringFormulaId: string;
  currentScore: number | null;
  proposedScore: number;
  delta: number | null;
  perspectiveStatuses: Array<{
    perspectiveId: string;
    status: RagStatus;
    currentStatusResultIds: string[];
    currentRollupResultIds: string[];
  }>;
}

function normalizeStatus(value: string): RagStatus | null {
  const normalized = value.trim().toLowerCase().replace(/[ -]+/g, "_");
  if (normalized === "on_track" || normalized === "watch" || normalized === "off_track") return normalized;
  return null;
}

function uiScore(riskScore: number): number {
  return Math.round((1 - riskScore) * 10_000) / 100;
}

function targetAttainment(
  actual: number,
  target: number,
  polarity: "HIGHER_IS_BETTER" | "LOWER_IS_BETTER",
): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(target) || actual < 0 || target < 0) return null;

  if (polarity === "HIGHER_IS_BETTER") {
    if (target === 0) return null;
    return Math.min(100, Math.round((actual / target) * 10_000) / 100);
  }

  if (actual === 0) return 100;
  return Math.min(100, Math.round((target / actual) * 10_000) / 100);
}

function proposalFromSnapshot(snapshot: unknown): { before: unknown; after: unknown; impactSummary?: unknown } | null {
  if (typeof snapshot !== "object" || snapshot === null) return null;
  const context = (snapshot as { context?: unknown }).context;
  if (typeof context !== "object" || context === null) return null;
  const proposed = (context as { proposedChange?: unknown }).proposedChange;
  if (typeof proposed !== "object" || proposed === null || !("after" in proposed) || !("before" in proposed)) return null;
  return proposed as { before: unknown; after: unknown; impactSummary?: unknown };
}

export class ScorecardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
    private readonly rules: RulesService,
    private readonly measurements: MeasurementService,
  ) {}

  async listScorecards(): Promise<ScorecardRow[]> {
    return this.prisma.$queryRaw<ScorecardRow[]>`
      SELECT id, name_en AS "nameEn", name_ar AS "nameAr",
             scope_node_id AS "scopeNodeId", plan_version_id AS "planVersionId",
             created_at AS "createdAt"
      FROM scorecard.scorecards
      ORDER BY created_at, id`;
  }

  async getScorecard(scorecardId: string) {
    const scorecard = await this.requireScorecard(scorecardId);
    const perspectives = await this.listPerspectives(scorecardId);
    const weighting = await this.getActiveWeighting(scorecardId);
    const publishedMap = await this.getPublishedMap(scorecardId);
    return { ...scorecard, perspectives, weighting, publishedMap };
  }

  /**
   * Read-only detail behind each perspective's placements: the placed
   * objective plus, via the same Placement -> Alignment -> KpiVersion ->
   * StatusResult join computeWeightingScore() uses to roll up perspective
   * RAG status, the aligned KPI's own name and latest status. Exists so the
   * Master Scorecard grid can render objective/KPI cards without a second,
   * disconnected data source — scorecard.get / weighting.preview alone don't
   * expose objective or KPI identity, only aggregated perspective status.
   */
  async listPlacementDetails(scorecardId: string): Promise<Array<{
    perspectiveId: string;
    objectiveNodeId: string;
    objectiveNameEn: string;
    objectiveNameAr: string;
    perspective: { id: string; nameEn: string; nameAr: string };
    owners: Array<{ id: string; displayName: string | null; email: string }>;
    kpiDefinitionId: string | null;
    kpiNameEn: string | null;
    kpiCount: number;
    initiativeCount: number;
    status: RagStatus | null;
    score: number | null;
    progress: number | null;
    trend: Array<{ period: string; score: number }>;
  }>> {
    const perspectives = await this.listPerspectives(scorecardId);
    if (perspectives.length === 0) return [];

    const perspectiveIds = perspectives.map((p) => p.id);
    const placements = await this.prisma.$queryRaw<PlacementRow[]>`
      SELECT perspective_id AS "perspectiveId", objective_node_id AS "objectiveNodeId"
      FROM scorecard.placements
      WHERE perspective_id = ANY(${perspectiveIds}::uuid[])`;

    if (placements.length === 0) return [];

    const objectiveIds = [...new Set(placements.map((placement) => placement.objectiveNodeId))];

    const [objectives, alignments, activeWeighting, executionEdges] = await Promise.all([
      this.prisma.strategyNode.findMany({
        where: { id: { in: objectiveIds } },
        include: {
          ownerAssignments: {
            orderBy: [{ assignedAt: "asc" }, { id: "asc" }],
            include: { owner: { select: { id: true, displayName: true, email: true } } },
          },
        },
      }),
      this.prisma.alignment.findMany({
        where: { strategyNodeId: { in: objectiveIds }, alignmentType: "OBJECTIVE" },
        include: {
          kpiDefinition: {
            include: { activeVersion: true },
          },
        },
      }),
      this.getActiveWeighting(scorecardId),
      this.prisma.strategyEdge.findMany({
        where: {
          fromNodeId: { in: objectiveIds },
          edgeType: "EXECUTED_BY",
          toNode: { type: "STRATEGIC_PLAY" },
        },
        select: { fromNodeId: true, toNodeId: true },
      }),
    ]);

    const playIds = [...new Set(executionEdges.map((edge) => edge.toNodeId))];
    const initiativeGroups = playIds.length === 0
      ? []
      : await this.prisma.initiative.groupBy({
          by: ["strategicPlayNodeId"],
          where: { strategicPlayNodeId: { in: playIds } },
          _count: { _all: true },
        });
    const initiativeCountByPlay = new Map(
      initiativeGroups.map((group) => [group.strategicPlayNodeId, group._count._all]),
    );
    const initiativeCountByObjective = new Map<string, number>();
    for (const edge of executionEdges) {
      initiativeCountByObjective.set(
        edge.fromNodeId,
        (initiativeCountByObjective.get(edge.fromNodeId) ?? 0) +
          (initiativeCountByPlay.get(edge.toNodeId) ?? 0),
      );
    }
    const perspectiveById = new Map(perspectives.map((perspective) => [perspective.id, perspective]));

    const objectiveById = new Map(
      objectives.map((node) => [node.id, node]),
    );

    const alignmentsByObjective = new Map<
      string,
      typeof alignments
    >();

    for (const alignment of alignments) {
      const existing = alignmentsByObjective.get(alignment.strategyNodeId) ?? [];
      existing.push(alignment);
      alignmentsByObjective.set(alignment.strategyNodeId, existing);
    }

    const statusByKey = new Map<string, { status: string; period: string }>();
    const statusHistoryByObjective = new Map<
      string,
      Map<string, Array<{ id: string; status: RagStatus }>>
    >();
    const seenHistoryKeys = new Set<string>();

    const withVersion = alignments.filter(
      (alignment) => alignment.kpiDefinition.activeVersionId,
    );

    if (withVersion.length > 0) {
      const statuses = await this.prisma.statusResult.findMany({
        where: {
          OR: withVersion.map((alignment) => ({
            kpiVersionId: alignment.kpiDefinition.activeVersionId!,
            scopeNodeId: alignment.strategyNodeId,
          })),
        },
        orderBy: [{ computedAt: "desc" }, { id: "desc" }],
      });

      for (const status of statuses) {
        const key = `${status.kpiVersionId}:${status.scopeNodeId}`;
        if (!statusByKey.has(key)) {
          statusByKey.set(key, { status: status.status, period: status.period });
        }

        const normalized = normalizeStatus(status.status);
        if (!normalized) continue;

        const historyKey =
          `${status.kpiVersionId}:${status.scopeNodeId}:${status.period}`;

        if (seenHistoryKeys.has(historyKey)) continue;
        seenHistoryKeys.add(historyKey);

        const periods =
          statusHistoryByObjective.get(status.scopeNodeId) ??
          new Map<string, Array<{ id: string; status: RagStatus }>>();

        const children = periods.get(status.period) ?? [];

        children.push({
          id: `${status.scopeNodeId}:${status.kpiVersionId}`,
          status: normalized,
        });

        periods.set(status.period, children);
        statusHistoryByObjective.set(status.scopeNodeId, periods);
      }
    }

    if (activeWeighting) {
      await this.requireRagRule(activeWeighting.scoringFormulaId);
    }

    const details = await Promise.all(
      placements.map(async (placement) => {
        const objective = objectiveById.get(placement.objectiveNodeId);
        const perspective = perspectiveById.get(placement.perspectiveId);
        if (!objective || !perspective) return null;

        const objectiveAlignments =
          alignmentsByObjective.get(placement.objectiveNodeId) ?? [];

        const primaryAlignment = objectiveAlignments[0] ?? null;

        const childStatuses: Array<{
          id: string;
          status: RagStatus;
        }> = [];

        for (const alignment of objectiveAlignments) {
          const activeVersionId = alignment.kpiDefinition.activeVersionId;
          if (!activeVersionId) continue;

          const currentStatus =
            statusByKey.get(
              `${activeVersionId}:${placement.objectiveNodeId}`,
            ) ?? null;

          if (!currentStatus) continue;

          const normalized = normalizeStatus(currentStatus.status);
          if (!normalized) continue;

          childStatuses.push({
            id: `${placement.objectiveNodeId}:${activeVersionId}`,
            status: normalized,
          });
        }

        let status: RagStatus | null = null;
        let score: number | null = null;
        const progressValues: number[] = [];

        await Promise.all(objectiveAlignments.map(async (alignment) => {
          const activeVersion = alignment.kpiDefinition.activeVersion;
          if (!activeVersion) return;

          const currentStatus = statusByKey.get(
            `${activeVersion.id}:${placement.objectiveNodeId}`,
          );
          if (!currentStatus) return;

          const [measurement, target] = await Promise.all([
            this.measurements.resolveCurrent({
              kpiVersionId: activeVersion.id,
              scopeNodeId: placement.objectiveNodeId,
              period: currentStatus.period,
            }),
            this.prisma.targetSeries.findUnique({
              where: {
                kpiVersionId_scopeNodeId_period_planVersionId: {
                  kpiVersionId: activeVersion.id,
                  scopeNodeId: placement.objectiveNodeId,
                  period: currentStatus.period,
                  planVersionId: objective.planVersionId,
                },
              },
            }),
          ]);

          if (!measurement || !target) return;
          const progress = targetAttainment(
            Number(measurement.value),
            Number(target.targetValue),
            activeVersion.polarity,
          );
          if (progress !== null) progressValues.push(progress);
        }));

        const progress = progressValues.length === 0
          ? null
          : Math.round(
              (progressValues.reduce((sum, value) => sum + value, 0) / progressValues.length) * 100,
            ) / 100;

        if (activeWeighting && childStatuses.length > 0) {
          const result = await this.rules.evaluate(
            activeWeighting.scoringFormulaId,
            { children: childStatuses },
          );

          if (
            typeof result !== "object" ||
            result === null ||
            !("status" in result) ||
            !("score" in result)
          ) {
            throw scorecardErrors.ruleInvalid(
              activeWeighting.scoringFormulaId,
            );
          }

          status = normalizeStatus(
            String((result as { status: unknown }).status),
          );

          const riskScore = (result as { score: unknown }).score;

          if (!status || typeof riskScore !== "number") {
            throw scorecardErrors.ruleInvalid(
              activeWeighting.scoringFormulaId,
            );
          }

          score = uiScore(riskScore);
        } else if (childStatuses.length === 1) {
          status = childStatuses[0]!.status;
        }

        const trend: Array<{ period: string; score: number }> = [];

        if (activeWeighting) {
          const periods =
            statusHistoryByObjective.get(placement.objectiveNodeId) ??
            new Map<string, Array<{ id: string; status: RagStatus }>>();

          for (const period of [...periods.keys()].sort()) {
            const children = periods.get(period) ?? [];
            if (children.length === 0) continue;

            const result = await this.rules.evaluate(
              activeWeighting.scoringFormulaId,
              { children },
            );

            if (
              typeof result !== "object" ||
              result === null ||
              !("score" in result) ||
              typeof (result as { score?: unknown }).score !== "number"
            ) {
              throw scorecardErrors.ruleInvalid(
                activeWeighting.scoringFormulaId,
              );
            }

            trend.push({
              period,
              score: uiScore((result as { score: number }).score),
            });
          }
        }

        return {
          perspectiveId: placement.perspectiveId,
          objectiveNodeId: placement.objectiveNodeId,
          objectiveNameEn: objective.nameEn,
          objectiveNameAr: objective.nameAr,
          perspective: {
            id: perspective.id,
            nameEn: perspective.nameEn,
            nameAr: perspective.nameAr,
          },
          owners: objective.ownerAssignments.map((assignment) => assignment.owner),
          kpiDefinitionId: primaryAlignment?.kpiDefinitionId ?? null,
          kpiNameEn:
            primaryAlignment?.kpiDefinition.activeVersion?.nameEn ?? null,
          kpiCount: objectiveAlignments.length,
          initiativeCount: initiativeCountByObjective.get(placement.objectiveNodeId) ?? 0,
          status,
          score,
          progress,
          trend,
        };
      }),
    );

    return details.filter(
      (row): row is NonNullable<typeof row> => row !== null,
    );
  }
  async createScorecard(input: {
    nameEn: string;
    nameAr: string;
    scopeNodeId?: string | null;
    planVersionId: string;
  }): Promise<ScorecardRow> {
    const plan = await this.prisma.planVersion.findUnique({ where: { id: input.planVersionId } });
    if (!plan) throw new Error("Plan version does not exist");
    if (input.scopeNodeId) {
      const scope = await this.prisma.strategyNode.findUnique({ where: { id: input.scopeNodeId } });
      if (!scope || scope.planVersionId !== input.planVersionId || scope.state !== "ACTIVE") {
        throw new Error("Scorecard scope must be an active node in the same plan version");
      }
    }
    const rows = await this.prisma.$queryRaw<ScorecardRow[]>`
      INSERT INTO scorecard.scorecards (name_en, name_ar, scope_node_id, plan_version_id)
      VALUES (${input.nameEn}, ${input.nameAr}, ${input.scopeNodeId ?? null}::uuid, ${input.planVersionId}::uuid)
      RETURNING id, name_en AS "nameEn", name_ar AS "nameAr",
                scope_node_id AS "scopeNodeId", plan_version_id AS "planVersionId",
                created_at AS "createdAt"`;
    return rows[0]!;
  }

  async addPerspective(input: {
    scorecardId: string;
    nameEn: string;
    nameAr: string;
    order: number;
    approvalCaseId: string;
  }): Promise<PerspectiveRow> {
    await this.assertApproved(input.approvalCaseId, PERSPECTIVE_ENTITY, input.scorecardId);
    await this.requireScorecard(input.scorecardId);
    const rows = await this.prisma.$queryRaw<PerspectiveRow[]>`
      INSERT INTO scorecard.perspectives (scorecard_id, name_en, name_ar, "order")
      VALUES (${input.scorecardId}::uuid, ${input.nameEn}, ${input.nameAr}, ${input.order})
      RETURNING id, scorecard_id AS "scorecardId", name_en AS "nameEn", name_ar AS "nameAr", "order"`;
    return rows[0]!;
  }

  async removePerspective(input: { scorecardId: string; perspectiveId: string; approvalCaseId: string }): Promise<{ removed: true }> {
    await this.assertApproved(input.approvalCaseId, PERSPECTIVE_ENTITY, input.scorecardId);
    const result = await this.prisma.$executeRaw`
      DELETE FROM scorecard.perspectives WHERE id = ${input.perspectiveId}::uuid AND scorecard_id = ${input.scorecardId}::uuid`;
    if (result !== 1) throw scorecardErrors.perspectiveNotFound(input.perspectiveId);
    return { removed: true };
  }

  async reorderPerspectives(input: {
    scorecardId: string;
    orderedPerspectiveIds: string[];
    approvalCaseId: string;
  }): Promise<PerspectiveRow[]> {
    await this.assertApproved(input.approvalCaseId, PERSPECTIVE_ENTITY, input.scorecardId);
    const existing = await this.listPerspectives(input.scorecardId);
    const expected = existing.map((p) => p.id).sort();
    const received = [...input.orderedPerspectiveIds].sort();
    if (expected.length !== received.length || expected.some((id, index) => id !== received[index])) {
      throw new Error("Reorder input must contain every scorecard perspective exactly once");
    }
    await this.prisma.$transaction(
      input.orderedPerspectiveIds.map((id, index) =>
        this.prisma.$executeRaw`UPDATE scorecard.perspectives SET "order" = ${index} WHERE id = ${id}::uuid`,
      ),
    );
    return this.listPerspectives(input.scorecardId);
  }

  async setPlacement(input: { perspectiveId: string; objectiveNodeId: string }): Promise<{ perspectiveId: string; objectiveNodeId: string }> {
    const perspective = await this.requirePerspective(input.perspectiveId);
    const scorecard = await this.requireScorecard(perspective.scorecardId);
    const objective = await this.prisma.strategyNode.findUnique({ where: { id: input.objectiveNodeId } });
    if (!objective || objective.type !== "OBJECTIVE" || objective.state !== "ACTIVE" || objective.planVersionId !== scorecard.planVersionId) {
      throw scorecardErrors.objectiveInvalid(input.objectiveNodeId);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM scorecard.placements
        WHERE objective_node_id = ${input.objectiveNodeId}::uuid
          AND perspective_id IN (SELECT id FROM scorecard.perspectives WHERE scorecard_id = ${scorecard.id}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO scorecard.placements (perspective_id, objective_node_id)
        VALUES (${input.perspectiveId}::uuid, ${input.objectiveNodeId}::uuid)`;
    });
    return input;
  }

  async previewWeighting(input: {
    scorecardId: string;
    draftWeights: unknown;
    scoringFormulaId?: string;
  }): Promise<WeightingPreview> {
    const perspectives = await this.listPerspectives(input.scorecardId);
    if (perspectives.length === 0) throw new Error("Scorecard must have at least one perspective");
    const perspectiveIds = perspectives.map((p) => p.id);
    const draftWeights = validatePerspectiveWeights(input.draftWeights, perspectiveIds);
    const current = await this.getActiveWeighting(input.scorecardId);
    const scoringFormulaId = input.scoringFormulaId ?? current?.scoringFormulaId;
    if (!scoringFormulaId) throw new Error("A scoring formula is required for the first weighting version");
    await this.requireRagRule(scoringFormulaId);

    const proposed = await this.computeWeightingScore(input.scorecardId, draftWeights, scoringFormulaId);
    let currentScore: number | null = null;
    if (current) {
      const currentWeights = validatePerspectiveWeights(current.perspectiveWeights, perspectiveIds);
      await this.requireRagRule(current.scoringFormulaId);
      currentScore = (await this.computeWeightingScore(input.scorecardId, currentWeights, current.scoringFormulaId)).score;
    }
    return {
      scorecardId: input.scorecardId,
      currentWeightingVersionId: current?.id ?? null,
      scoringFormulaId,
      currentScore,
      proposedScore: proposed.score,
      delta: currentScore === null ? null : Math.round((proposed.score - currentScore) * 100) / 100,
      perspectiveStatuses: proposed.perspectiveStatuses,
    };
  }

  async scoreTrend(scorecardId: string): Promise<Array<{ period: string; score: number }>> {
    const perspectives = await this.listPerspectives(scorecardId);
    const current = await this.getActiveWeighting(scorecardId);
    if (!current || perspectives.length === 0) return [];

    const perspectiveIds = perspectives.map((perspective) => perspective.id);
    const weights = validatePerspectiveWeights(current.perspectiveWeights, perspectiveIds);
    await this.requireRagRule(current.scoringFormulaId);

    const placements = await this.prisma.$queryRaw<PlacementRow[]>`
      SELECT perspective_id AS "perspectiveId", objective_node_id AS "objectiveNodeId"
      FROM scorecard.placements
      WHERE perspective_id IN (
        SELECT id FROM scorecard.perspectives
        WHERE scorecard_id = ${scorecardId}::uuid
      )`;

    const periodSets: Array<Set<string>> = [];

    for (const perspective of perspectives) {
      const objectiveIds = placements
        .filter((placement) => placement.perspectiveId === perspective.id)
        .map((placement) => placement.objectiveNodeId);

      if (objectiveIds.length === 0) return [];

      const alignments = await this.prisma.alignment.findMany({
        where: { strategyNodeId: { in: objectiveIds } },
        select: {
          strategyNodeId: true,
          kpiDefinition: { select: { activeVersionId: true } },
        },
      });

      const statusCoordinates = alignments.flatMap((alignment) => {
        const activeVersionId = alignment.kpiDefinition.activeVersionId;
        return activeVersionId
          ? [{
              kpiVersionId: activeVersionId,
              scopeNodeId: alignment.strategyNodeId,
            }]
          : [];
      });

      if (statusCoordinates.length === 0) return [];

      const rows = await this.prisma.statusResult.findMany({
        where: { OR: statusCoordinates },
        select: { period: true },
        distinct: ["period"],
      });

      periodSets.push(new Set(rows.map((row) => row.period)));
    }

    const [firstPeriodSet, ...remainingPeriodSets] = periodSets;
    if (!firstPeriodSet) return [];

    const periods = [...firstPeriodSet]
      .filter((period) => remainingPeriodSets.every((set) => set.has(period)))
      .sort();

    const trend: Array<{ period: string; score: number }> = [];

    for (const period of periods) {
      const result = await this.computeWeightingScore(
        scorecardId,
        weights,
        current.scoringFormulaId,
        period,
      );
      trend.push({ period, score: result.score });
    }

    return trend;
  }
  async proposeWeighting(input: {
    scorecardId: string;
    draftWeights: unknown;
    scoringFormulaId?: string;
    activeFrom: Date;
    actorUserId: string;
    approvalParticipantId: string;
  }) {
    const preview = await this.previewWeighting(input);
    const current = await this.getActiveWeighting(input.scorecardId);
    return this.governance.submitCase({
      entityType: WEIGHTING_ENTITY,
      entityId: input.scorecardId,
      submittedBy: input.actorUserId,
      approvalParticipantId: input.approvalParticipantId,
      proposedChange: {
        before: current
          ? { perspectiveWeights: current.perspectiveWeights, scoringFormulaId: current.scoringFormulaId, activeFrom: current.activeFrom.toISOString() }
          : null,
        after: {
          perspectiveWeights: validatePerspectiveWeights(input.draftWeights, (await this.listPerspectives(input.scorecardId)).map((p) => p.id)),
          scoringFormulaId: preview.scoringFormulaId,
          activeFrom: input.activeFrom.toISOString(),
        },
        impactSummary: preview,
      },
    });
  }

  async publishWeighting(input: { scorecardId: string; approvalCaseId: string }): Promise<WeightingRow> {
    await this.assertApproved(input.approvalCaseId, WEIGHTING_ENTITY, input.scorecardId);
    const approval = await this.governance.getCase(input.approvalCaseId);
    const proposal = proposalFromSnapshot(approval.xstateContextSnapshot);
    const after = proposal?.after;
    if (typeof after !== "object" || after === null) throw scorecardErrors.invalidProposal();
    const candidate = after as { perspectiveWeights?: unknown; scoringFormulaId?: unknown; activeFrom?: unknown };
    if (typeof candidate.scoringFormulaId !== "string" || typeof candidate.activeFrom !== "string") throw scorecardErrors.invalidProposal();
    const perspectives = await this.listPerspectives(input.scorecardId);
    const weights = validatePerspectiveWeights(candidate.perspectiveWeights, perspectives.map((p) => p.id));
    await this.requireRagRule(candidate.scoringFormulaId);
    const activeFrom = new Date(candidate.activeFrom);
    if (Number.isNaN(activeFrom.getTime())) throw scorecardErrors.invalidProposal();
    const current = await this.getActiveWeighting(input.scorecardId);
    const rows = await this.prisma.$queryRaw<WeightingRow[]>`
      INSERT INTO scorecard.weighting_versions
        (scorecard_id, perspective_weights, scoring_formula_id, active_from, supersedes_id, approval_case_id)
      VALUES
        (${input.scorecardId}::uuid, ${JSON.stringify(weights)}::jsonb, ${candidate.scoringFormulaId}, ${activeFrom}, ${current?.id ?? null}::uuid, ${input.approvalCaseId}::uuid)
      RETURNING id, scorecard_id AS "scorecardId", perspective_weights AS "perspectiveWeights",
                scoring_formula_id AS "scoringFormulaId", active_from AS "activeFrom",
                supersedes_id AS "supersedesId", approval_case_id AS "approvalCaseId"`;
    return rows[0]!;
  }

  async draftLink(input: { scorecardId: string; strategyMapId?: string; link: MapLinkInput }): Promise<{ map: MapRow; link: LinkRow }> {
    const link = validateMapLink(input.link);
    const scorecard = await this.requireScorecard(input.scorecardId);
    const [from, to] = await Promise.all([
      this.prisma.strategyNode.findUnique({ where: { id: link.fromObjectiveId } }),
      this.prisma.strategyNode.findUnique({ where: { id: link.toObjectiveId } }),
    ]);
    for (const objective of [from, to]) {
      if (!objective || objective.type !== "OBJECTIVE" || objective.state !== "ACTIVE" || objective.planVersionId !== scorecard.planVersionId) {
        throw scorecardErrors.objectiveInvalid(objective?.id ?? "unknown");
      }
    }
    let map = input.strategyMapId ? await this.getMap(input.strategyMapId) : await this.getDraftMap(input.scorecardId);
    if (!map) {
      const maps = await this.prisma.$queryRaw<MapRow[]>`
        INSERT INTO scorecard.strategy_maps (scorecard_id, state)
        VALUES (${input.scorecardId}::uuid, 'draft'::scorecard.strategy_map_state)
        RETURNING id, scorecard_id AS "scorecardId", state::text AS state,
                  approval_case_id AS "approvalCaseId", created_at AS "createdAt"`;
      map = maps[0]!;
    }
    if (map.scorecardId !== input.scorecardId) throw scorecardErrors.mapNotFound(map.id);
    if (map.state !== "draft") throw scorecardErrors.mapNotDraft();
    const rows = await this.prisma.$queryRaw<LinkRow[]>`
      INSERT INTO scorecard.map_links (strategy_map_id, from_objective_id, to_objective_id, strength)
      VALUES (${map.id}::uuid, ${link.fromObjectiveId}::uuid, ${link.toObjectiveId}::uuid, ${link.strength}::scorecard.map_link_strength)
      RETURNING id, strategy_map_id AS "strategyMapId", from_objective_id AS "fromObjectiveId",
                to_objective_id AS "toObjectiveId", strength::text AS strength`;
    return { map, link: rows[0]! };
  }

  async removeDraftLink(input: { strategyMapId: string; linkId: string }): Promise<{ removed: true }> {
    const map = await this.getMap(input.strategyMapId);
    if (!map) throw scorecardErrors.mapNotFound(input.strategyMapId);
    if (map.state !== "draft") throw scorecardErrors.mapNotDraft();
    const count = await this.prisma.$executeRaw`
      DELETE FROM scorecard.map_links WHERE id = ${input.linkId}::uuid AND strategy_map_id = ${input.strategyMapId}::uuid`;
    if (count !== 1) throw new Error("Map link was not found");
    return { removed: true };
  }

  async proposeMap(input: { strategyMapId: string; actorUserId: string; approvalParticipantId: string }) {
    const map = await this.getMap(input.strategyMapId);
    if (!map) throw scorecardErrors.mapNotFound(input.strategyMapId);
    if (map.state !== "draft") throw scorecardErrors.mapNotDraft();
    const links = await this.listMapLinks(map.id);
    const published = await this.getPublishedMap(map.scorecardId);
    const before = published ? await this.listMapLinks(published.id) : [];
    return this.governance.submitCase({
      entityType: MAP_ENTITY,
      entityId: map.id,
      submittedBy: input.actorUserId,
      approvalParticipantId: input.approvalParticipantId,
      proposedChange: { before, after: links, impactSummary: { addedOrChangedLinks: links.length, previousLinks: before.length } },
    });
  }

  async publishMap(input: { strategyMapId: string; approvalCaseId: string }): Promise<MapRow> {
    await this.assertApproved(input.approvalCaseId, MAP_ENTITY, input.strategyMapId);
    const map = await this.getMap(input.strategyMapId);
    if (!map) throw scorecardErrors.mapNotFound(input.strategyMapId);
    if (map.state !== "draft") throw scorecardErrors.mapNotDraft();
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE scorecard.strategy_maps SET state = 'draft'::scorecard.strategy_map_state
        WHERE scorecard_id = ${map.scorecardId}::uuid AND state = 'published'::scorecard.strategy_map_state`;
      return tx.$queryRaw<MapRow[]>`
        UPDATE scorecard.strategy_maps
        SET state = 'published'::scorecard.strategy_map_state, approval_case_id = ${input.approvalCaseId}::uuid
        WHERE id = ${input.strategyMapId}::uuid
        RETURNING id, scorecard_id AS "scorecardId", state::text AS state,
                  approval_case_id AS "approvalCaseId", created_at AS "createdAt"`;
    });
    return rows[0]!;
  }

  async getPublishedMap(scorecardId: string): Promise<(MapRow & { links: LinkRow[] }) | null> {
    const rows = await this.prisma.$queryRaw<MapRow[]>`
      SELECT id, scorecard_id AS "scorecardId", state::text AS state,
             approval_case_id AS "approvalCaseId", created_at AS "createdAt"
      FROM scorecard.strategy_maps
      WHERE scorecard_id = ${scorecardId}::uuid AND state = 'published'::scorecard.strategy_map_state
      ORDER BY created_at DESC, id DESC LIMIT 1`;
    const map = rows[0];
    return map ? { ...map, links: await this.listMapLinks(map.id) } : null;
  }

  private async computeWeightingScore(scorecardId: string, weights: PerspectiveWeights, scoringFormulaId: string, period?: string) {
    const perspectives = await this.listPerspectives(scorecardId);
    const placements = await this.prisma.$queryRaw<PlacementRow[]>`
      SELECT perspective_id AS "perspectiveId", objective_node_id AS "objectiveNodeId"
      FROM scorecard.placements
      WHERE perspective_id IN (SELECT id FROM scorecard.perspectives WHERE scorecard_id = ${scorecardId}::uuid)`;
    const statuses: WeightingPreview["perspectiveStatuses"] = [];
    for (const perspective of perspectives) {
      const objectiveIds = placements.filter((placement) => placement.perspectiveId === perspective.id).map((placement) => placement.objectiveNodeId);
      const alignments = objectiveIds.length === 0
        ? []
        : await this.prisma.alignment.findMany({
            where: { strategyNodeId: { in: objectiveIds } },
            select: { strategyNodeId: true, kpiDefinitionId: true, kpiDefinition: { select: { activeVersionId: true } } },
          });
      const childStatuses: Array<{ id: string; status: RagStatus }> = [];
      const statusIds: string[] = [];
      const rollupIds: string[] = [];
      for (const alignment of alignments) {
        const activeVersionId = alignment.kpiDefinition.activeVersionId;
        if (!activeVersionId) continue;
        const [status, rollup] = await Promise.all([
          this.prisma.statusResult.findFirst({
            where: {
              kpiVersionId: activeVersionId,
              scopeNodeId: alignment.strategyNodeId,
              ...(period ? { period } : {}),
            },
            orderBy: [{ computedAt: "desc" }, { id: "desc" }],
          }),
          this.prisma.rollupResult.findFirst({
            where: {
              parentKpiId: alignment.kpiDefinitionId,
              scopeNodeId: alignment.strategyNodeId,
              ...(period ? { period } : {}),
            },
            orderBy: [{ computedAt: "desc" }, { id: "desc" }],
          }),
        ]);
        if (rollup) rollupIds.push(rollup.id);
        if (!status) continue;
        const normalized = normalizeStatus(status.status);
        if (!normalized) throw new Error(`Unsupported RAG status '${status.status}'`);
        statusIds.push(status.id);
        childStatuses.push({ id: `${alignment.strategyNodeId}:${activeVersionId}`, status: normalized });
      }
      if (childStatuses.length === 0) throw scorecardErrors.statusMissing(perspective.id);
      const result = await this.rules.evaluate(scoringFormulaId, { children: childStatuses });
      if (typeof result !== "object" || result === null || !("status" in result) || !("score" in result)) {
        throw scorecardErrors.ruleInvalid(scoringFormulaId);
      }
      const status = normalizeStatus(String((result as { status: unknown }).status));
      const score = (result as { score: unknown }).score;
      if (!status || typeof score !== "number") throw scorecardErrors.ruleInvalid(scoringFormulaId);
      statuses.push({ perspectiveId: perspective.id, status, currentStatusResultIds: statusIds, currentRollupResultIds: rollupIds });
    }
    const aggregate = await this.rules.evaluate(scoringFormulaId, {
      children: statuses.map((perspective) => ({
        id: perspective.perspectiveId,
        status: perspective.status,
        weight: weights[perspective.perspectiveId],
      })),
    });
    if (typeof aggregate !== "object" || aggregate === null || !("score" in aggregate) || typeof (aggregate as { score?: unknown }).score !== "number") {
      throw scorecardErrors.ruleInvalid(scoringFormulaId);
    }
    return { score: uiScore((aggregate as { score: number }).score), perspectiveStatuses: statuses };
  }

  private async requireRagRule(ruleId: string) {
    const rule = await this.prisma.ruleDefinition.findUnique({ where: { id: ruleId } });
    if (!rule || rule.ruleType !== "RAG_AGGREGATION" || rule.status !== "PUBLISHED") throw scorecardErrors.ruleInvalid(ruleId);
    return rule;
  }

  private async assertApproved(approvalCaseId: string, entityType: string, entityId: string) {
    try {
      await this.governance.assertApproved({ approvalCaseId, entityType, entityId });
    } catch {
      throw scorecardErrors.approvalRequired();
    }
  }

  private async requireScorecard(id: string): Promise<ScorecardRow> {
    const rows = await this.prisma.$queryRaw<ScorecardRow[]>`
      SELECT id, name_en AS "nameEn", name_ar AS "nameAr", scope_node_id AS "scopeNodeId",
             plan_version_id AS "planVersionId", created_at AS "createdAt"
      FROM scorecard.scorecards WHERE id = ${id}::uuid`;
    if (!rows[0]) throw scorecardErrors.notFound(id);
    return rows[0];
  }

  private async listPerspectives(scorecardId: string): Promise<PerspectiveRow[]> {
    return this.prisma.$queryRaw<PerspectiveRow[]>`
      SELECT id, scorecard_id AS "scorecardId", name_en AS "nameEn", name_ar AS "nameAr", "order"
      FROM scorecard.perspectives WHERE scorecard_id = ${scorecardId}::uuid ORDER BY "order", id`;
  }

  private async requirePerspective(id: string): Promise<PerspectiveRow> {
    const rows = await this.prisma.$queryRaw<PerspectiveRow[]>`
      SELECT id, scorecard_id AS "scorecardId", name_en AS "nameEn", name_ar AS "nameAr", "order"
      FROM scorecard.perspectives WHERE id = ${id}::uuid`;
    if (!rows[0]) throw scorecardErrors.perspectiveNotFound(id);
    return rows[0];
  }

  private async getActiveWeighting(scorecardId: string): Promise<WeightingRow | null> {
    const rows = await this.prisma.$queryRaw<WeightingRow[]>`
      SELECT id, scorecard_id AS "scorecardId", perspective_weights AS "perspectiveWeights",
             scoring_formula_id AS "scoringFormulaId", active_from AS "activeFrom",
             supersedes_id AS "supersedesId", approval_case_id AS "approvalCaseId"
      FROM scorecard.weighting_versions
      WHERE scorecard_id = ${scorecardId}::uuid AND active_from <= now()
      ORDER BY active_from DESC, id DESC LIMIT 1`;
    return rows[0] ?? null;
  }

  private async getDraftMap(scorecardId: string): Promise<MapRow | null> {
    const rows = await this.prisma.$queryRaw<MapRow[]>`
      SELECT id, scorecard_id AS "scorecardId", state::text AS state, approval_case_id AS "approvalCaseId", created_at AS "createdAt"
      FROM scorecard.strategy_maps
      WHERE scorecard_id = ${scorecardId}::uuid AND state = 'draft'::scorecard.strategy_map_state
      ORDER BY created_at DESC, id DESC LIMIT 1`;
    return rows[0] ?? null;
  }

  private async getMap(mapId: string): Promise<MapRow | null> {
    const rows = await this.prisma.$queryRaw<MapRow[]>`
      SELECT id, scorecard_id AS "scorecardId", state::text AS state, approval_case_id AS "approvalCaseId", created_at AS "createdAt"
      FROM scorecard.strategy_maps WHERE id = ${mapId}::uuid`;
    return rows[0] ?? null;
  }

  private async listMapLinks(mapId: string): Promise<LinkRow[]> {
    return this.prisma.$queryRaw<LinkRow[]>`
      SELECT id, strategy_map_id AS "strategyMapId", from_objective_id AS "fromObjectiveId",
             to_objective_id AS "toObjectiveId", strength::text AS strength
      FROM scorecard.map_links WHERE strategy_map_id = ${mapId}::uuid ORDER BY id`;
  }
}
