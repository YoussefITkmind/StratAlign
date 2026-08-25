import type { PrismaService } from "../../database/prisma.service";

type ScorecardStatus = "on-track" | "at-risk" | "draft";
type ObjectiveStatus = "on-track" | "at-risk" | "off-track" | "not-started";
type PerspectiveKey = "financial" | "customer" | "internal-process" | "learning-growth";

type KpiInput = {
  name: string;
  status: ScorecardStatus;
  owner: { initials: string; color: string };
  score: number;
  priorScore?: number;
  weight?: number;
  actual?: string;
  target?: string;
  variance?: string;
  trend?: number[];
};

type PerspectiveInput = {
  key: PerspectiveKey;
  owner: { initials: string; color: string };
  score: number;
  priorScore?: number;
  weight: number;
  kpis: KpiInput[];
};

export type CreateBalancedScorecardInput = {
  nameEn: string;
  nameAr: string;
  scopeNodeId?: string | null;
  planVersionId: string;
  description?: string;
  department: string;
  period: string;
  ownerName: string;
  ownerInitials?: string;
  status: ScorecardStatus;
  score: number;
  priorScore?: number;
  reviewFrequency?: string;
  startDate?: string;
  endDate?: string;
  strategyName?: string;
  strategicTheme?: string;
  strategicObjective?: string;
  primaryPerspective?: PerspectiveKey | "all";
  strategicWeight?: number;
  tags?: string[];
  notes?: string;
  perspectives: PerspectiveInput[];
};

export type CreateScorecardObjectiveInput = {
  scorecardId: string;
  perspectiveId: string;
  name: string;
  status: ObjectiveStatus;
  progress: number;
  ownerName: string;
  ownerInitials?: string;
  ownerColor?: string;
  description?: string | null;
  kpiSnapshotIds?: string[];
  actorUserId: string;
};

export type UpdateScorecardObjectiveInput = Omit<CreateScorecardObjectiveInput, "actorUserId"> & {
  objectiveNodeId: string;
};

export type CreateScorecardKpiInput = {
  scorecardId: string;
  perspectiveId: string;
  name: string;
  status: ScorecardStatus;
  ownerInitials: string;
  ownerColor: string;
  score: number;
  priorScore?: number;
  weight?: number;
  actual?: string;
  target?: string;
  variance?: string;
  trend?: number[];
  objectiveNodeIds?: string[];
};

export type UpdateScorecardKpiInput = CreateScorecardKpiInput & { kpiSnapshotId: string };

type ScorecardRow = {
  id: string;
  nameEn: string;
  nameAr: string;
  scopeNodeId: string | null;
  planVersionId: string;
  isBalancedScorecard: boolean;
  description: string | null;
  department: string;
  period: string;
  ownerName: string;
  ownerInitials: string | null;
  status: ScorecardStatus;
  score: unknown;
  priorScore: unknown | null;
  reviewFrequency: string | null;
  startDate: string | null;
  endDate: string | null;
  strategyName: string | null;
  strategicTheme: string | null;
  strategicObjective: string | null;
  primaryPerspective: PerspectiveKey | "all" | null;
  strategicWeight: unknown | null;
  tags: string[];
  notes: string | null;
  createdAt: Date;
};

type PerspectiveRow = {
  id: string;
  scorecardId: string;
  key: PerspectiveKey | null;
  nameEn: string;
  order: number;
  ownerInitials: string | null;
  ownerColor: string | null;
  score: unknown;
  priorScore: unknown | null;
  weight: unknown;
};

type KpiRow = {
  id: string;
  perspectiveId: string;
  name: string;
  status: ScorecardStatus;
  ownerInitials: string | null;
  ownerColor: string | null;
  score: unknown;
  priorScore: unknown | null;
  weight: unknown | null;
  actual: string | null;
  target: string | null;
  variance: string | null;
  trend: unknown;
};

type ObjectiveRow = {
  objectiveNodeId: string;
  scorecardId: string;
  perspectiveId: string;
  name: string;
  status: ObjectiveStatus;
  progress: unknown;
  ownerName: string;
  ownerInitials: string | null;
  ownerColor: string | null;
  description: string | null;
};

type ObjectiveKpiLinkRow = { objectiveNodeId: string; kpiSnapshotId: string };

type TransactionClient = Parameters<Parameters<PrismaService["$transaction"]>[0]>[0];

function optionalNumber(value: unknown | null): number | undefined {
  if (value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function perspectiveKeyFromName(name: string): PerspectiveKey {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, "-");
  if (normalized === "financial") return "financial";
  if (normalized === "customer") return "customer";
  if (normalized === "internal-process") return "internal-process";
  return "learning-growth";
}

function trendValues(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is number => typeof item === "number" && Number.isFinite(item));
}

function objectiveStatus(status: ScorecardStatus): ObjectiveStatus {
  if (status === "on-track") return "on-track";
  if (status === "at-risk") return "at-risk";
  return "not-started";
}

function deriveInitials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "—";
}

async function refreshObjectiveFromLinkedKpis(tx: TransactionClient, objectiveNodeId: string) {
  const rows = await tx.$queryRaw<Array<{
    count: number;
    averageScore: number | null;
    atRisk: number;
    draft: number;
  }>>`
    SELECT
      COUNT(k.id)::int AS count,
      AVG(k.score)::float8 AS "averageScore",
      COUNT(*) FILTER (WHERE k.status = 'at-risk')::int AS "atRisk",
      COUNT(*) FILTER (WHERE k.status = 'draft')::int AS draft
    FROM scorecard.objective_kpi_links l
    JOIN scorecard.kpi_snapshots k ON k.id = l.kpi_snapshot_id
    WHERE l.objective_node_id = ${objectiveNodeId}::uuid`;

  const row = rows[0];
  if (!row || row.count === 0) return;

  const status: ObjectiveStatus = row.atRisk > 0
    ? "at-risk"
    : row.draft === row.count
      ? "not-started"
      : row.draft > 0
        ? "at-risk"
        : "on-track";

  await tx.$executeRaw`
    UPDATE scorecard.objective_profiles
    SET status = ${status},
        progress = ${Math.max(0, Math.min(100, row.averageScore ?? 0))},
        updated_at = NOW()
    WHERE objective_node_id = ${objectiveNodeId}::uuid`;
}

export class BalancedScorecardService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [scorecards, perspectives, kpis, objectives, objectiveKpiLinks] = await Promise.all([
      this.prisma.$queryRaw<ScorecardRow[]>`
        SELECT s.id,
               s.name_en AS "nameEn",
               s.name_ar AS "nameAr",
               s.scope_node_id AS "scopeNodeId",
               s.plan_version_id AS "planVersionId",
               (p.scorecard_id IS NOT NULL) AS "isBalancedScorecard",
               p.description,
               COALESCE(p.department, 'Corporate') AS department,
               COALESCE(p.period, '—') AS period,
               COALESCE(p.owner_name, 'Unassigned') AS "ownerName",
               p.owner_initials AS "ownerInitials",
               COALESCE(p.status, 'draft') AS status,
               COALESCE(p.score, 0) AS score,
               p.prior_score AS "priorScore",
               p.review_frequency AS "reviewFrequency",
               p.start_period AS "startDate",
               p.end_period AS "endDate",
               p.strategy_name AS "strategyName",
               p.strategic_theme AS "strategicTheme",
               p.strategic_objective AS "strategicObjective",
               p.primary_perspective AS "primaryPerspective",
               p.strategic_weight AS "strategicWeight",
               COALESCE(p.tags, ARRAY[]::TEXT[]) AS tags,
               p.notes,
               s.created_at AS "createdAt"
        FROM scorecard.scorecards s
        LEFT JOIN scorecard.balanced_scorecard_profiles p ON p.scorecard_id = s.id
        ORDER BY s.created_at, s.id`,
      this.prisma.$queryRaw<PerspectiveRow[]>`
        SELECT p.id,
               p.scorecard_id AS "scorecardId",
               bp.perspective_key AS "key",
               p.name_en AS "nameEn",
               p."order",
               bp.owner_initials AS "ownerInitials",
               bp.owner_color AS "ownerColor",
               COALESCE(bp.score, 0) AS score,
               bp.prior_score AS "priorScore",
               COALESCE(bp.weight, 0) AS weight
        FROM scorecard.perspectives p
        LEFT JOIN scorecard.balanced_perspective_profiles bp ON bp.perspective_id = p.id
        ORDER BY p.scorecard_id, p."order", p.id`,
      this.prisma.$queryRaw<KpiRow[]>`
        SELECT id,
               perspective_id AS "perspectiveId",
               name,
               status,
               owner_initials AS "ownerInitials",
               owner_color AS "ownerColor",
               score,
               prior_score AS "priorScore",
               weight,
               actual,
               target,
               variance,
               trend
        FROM scorecard.kpi_snapshots
        ORDER BY created_at, id`,
      this.prisma.$queryRaw<ObjectiveRow[]>`
        SELECT op.objective_node_id AS "objectiveNodeId",
               op.scorecard_id AS "scorecardId",
               pl.perspective_id AS "perspectiveId",
               n.name_en AS name,
               op.status,
               op.progress,
               op.owner_name AS "ownerName",
               op.owner_initials AS "ownerInitials",
               op.owner_color AS "ownerColor",
               op.description
        FROM scorecard.objective_profiles op
        JOIN strategy.strategy_nodes n ON n.id = op.objective_node_id
        JOIN scorecard.placements pl ON pl.objective_node_id = op.objective_node_id
        JOIN scorecard.perspectives p ON p.id = pl.perspective_id AND p.scorecard_id = op.scorecard_id
        WHERE n.state <> 'retired'
        ORDER BY op.created_at, op.objective_node_id`,
      this.prisma.$queryRaw<ObjectiveKpiLinkRow[]>`
        SELECT objective_node_id AS "objectiveNodeId", kpi_snapshot_id AS "kpiSnapshotId"
        FROM scorecard.objective_kpi_links
        ORDER BY created_at, objective_node_id, kpi_snapshot_id`,
    ]);

    const linkedKpisByObjective = new Map<string, string[]>();
    const linkedObjectivesByKpi = new Map<string, string[]>();
    for (const link of objectiveKpiLinks) {
      linkedKpisByObjective.set(link.objectiveNodeId, [...(linkedKpisByObjective.get(link.objectiveNodeId) ?? []), link.kpiSnapshotId]);
      linkedObjectivesByKpi.set(link.kpiSnapshotId, [...(linkedObjectivesByKpi.get(link.kpiSnapshotId) ?? []), link.objectiveNodeId]);
    }

    const kpisByPerspective = new Map<string, KpiRow[]>();
    const kpiById = new Map(kpis.map((kpi) => [kpi.id, kpi]));
    for (const kpi of kpis) {
      kpisByPerspective.set(kpi.perspectiveId, [...(kpisByPerspective.get(kpi.perspectiveId) ?? []), kpi]);
    }

    const objectivesByPerspective = new Map<string, ObjectiveRow[]>();
    for (const objective of objectives) {
      objectivesByPerspective.set(objective.perspectiveId, [...(objectivesByPerspective.get(objective.perspectiveId) ?? []), objective]);
    }

    const perspectivesByScorecard = new Map<string, PerspectiveRow[]>();
    for (const perspective of perspectives) {
      perspectivesByScorecard.set(perspective.scorecardId, [...(perspectivesByScorecard.get(perspective.scorecardId) ?? []), perspective]);
    }

    return scorecards.map((scorecard) => ({
      id: scorecard.id,
      name: scorecard.nameEn,
      nameEn: scorecard.nameEn,
      nameAr: scorecard.nameAr,
      scopeNodeId: scorecard.scopeNodeId,
      planVersionId: scorecard.planVersionId,
      isBalancedScorecard: scorecard.isBalancedScorecard,
      description: scorecard.description ?? undefined,
      department: scorecard.department,
      period: scorecard.period,
      ownerName: scorecard.ownerName,
      ownerInitials: scorecard.ownerInitials ?? undefined,
      status: scorecard.status,
      score: Number(scorecard.score),
      priorScore: optionalNumber(scorecard.priorScore),
      reviewFrequency: scorecard.reviewFrequency ?? undefined,
      startDate: scorecard.startDate ?? undefined,
      endDate: scorecard.endDate ?? undefined,
      strategyName: scorecard.strategyName ?? undefined,
      strategicTheme: scorecard.strategicTheme ?? undefined,
      strategicObjective: scorecard.strategicObjective ?? undefined,
      primaryPerspective: scorecard.primaryPerspective ?? undefined,
      strategicWeight: optionalNumber(scorecard.strategicWeight),
      tags: scorecard.tags.length > 0 ? scorecard.tags : undefined,
      notes: scorecard.notes ?? undefined,
      perspectives: (perspectivesByScorecard.get(scorecard.id) ?? []).map((perspective) => ({
        id: perspective.id,
        key: perspective.key ?? perspectiveKeyFromName(perspective.nameEn),
        owner: {
          initials: perspective.ownerInitials ?? scorecard.ownerInitials ?? "—",
          color: perspective.ownerColor ?? "bg-slate-500",
        },
        score: Number(perspective.score),
        priorScore: optionalNumber(perspective.priorScore),
        weight: Number(perspective.weight),
        objectives: (objectivesByPerspective.get(perspective.id) ?? []).map((objective) => {
          const linkedKpiIds = linkedKpisByObjective.get(objective.objectiveNodeId) ?? [];
          return {
            id: objective.objectiveNodeId,
            name: objective.name,
            status: objective.status,
            progress: Number(objective.progress),
            ownerName: objective.ownerName,
            ownerInitials: objective.ownerInitials ?? deriveInitials(objective.ownerName),
            ownerColor: objective.ownerColor ?? "bg-slate-500",
            description: objective.description ?? undefined,
            linkedKpiIds,
            linkedKpis: linkedKpiIds.map((kpiId) => kpiById.get(kpiId)?.name).filter((name): name is string => Boolean(name)),
          };
        }),
        kpis: (kpisByPerspective.get(perspective.id) ?? []).map((kpi) => ({
          id: kpi.id,
          name: kpi.name,
          status: kpi.status,
          owner: {
            initials: kpi.ownerInitials ?? perspective.ownerInitials ?? "—",
            color: kpi.ownerColor ?? perspective.ownerColor ?? "bg-slate-500",
          },
          score: Number(kpi.score),
          priorScore: optionalNumber(kpi.priorScore),
          weight: optionalNumber(kpi.weight),
          actual: kpi.actual ?? undefined,
          target: kpi.target ?? undefined,
          variance: kpi.variance ?? undefined,
          trend: trendValues(kpi.trend),
          linkedObjectiveIds: linkedObjectivesByKpi.get(kpi.id) ?? [],
        })),
      })),
    }));
  }

  async create(input: CreateBalancedScorecardInput) {
    const plan = await this.prisma.planVersion.findUnique({ where: { id: input.planVersionId } });
    if (!plan) throw new Error("Plan version does not exist");

    if (input.scopeNodeId) {
      const scope = await this.prisma.strategyNode.findUnique({ where: { id: input.scopeNodeId } });
      if (!scope || scope.planVersionId !== input.planVersionId || scope.state !== "ACTIVE") {
        throw new Error("Scorecard scope must be an active node in the same plan version");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const actorRows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM iam.users ORDER BY created_at, id LIMIT 1`;
      const actorUserId = actorRows[0]?.id;
      if (!actorUserId) throw new Error("At least one IAM user is required to create a scorecard strategy objective");

      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO scorecard.scorecards (name_en, name_ar, scope_node_id, plan_version_id)
        VALUES (${input.nameEn}, ${input.nameAr}, ${input.scopeNodeId ?? null}::uuid, ${input.planVersionId}::uuid)
        RETURNING id`;
      const scorecardId = rows[0]!.id;

      await tx.$executeRaw`
        INSERT INTO scorecard.balanced_scorecard_profiles (
          scorecard_id, description, department, period, owner_name, owner_initials,
          status, score, prior_score, review_frequency, start_period, end_period,
          strategy_name, strategic_theme, strategic_objective, primary_perspective,
          strategic_weight, tags, notes
        ) VALUES (
          ${scorecardId}::uuid, ${input.description ?? null}, ${input.department}, ${input.period}, ${input.ownerName}, ${input.ownerInitials ?? null},
          ${input.status}, ${input.score}, ${input.priorScore ?? null}, ${input.reviewFrequency ?? null}, ${input.startDate ?? null}, ${input.endDate ?? null},
          ${input.strategyName ?? null}, ${input.strategicTheme ?? null}, ${input.strategicObjective ?? null}, ${input.primaryPerspective ?? null},
          ${input.strategicWeight ?? null}, ${input.tags ?? []}::text[], ${input.notes ?? null}
        )`;

      const createdPerspectives = new Map<PerspectiveKey, { id: string; ownerInitials: string; ownerColor: string; kpiIds: string[] }>();

      for (const [index, perspective] of input.perspectives.entries()) {
        const nameEn = perspective.key === "financial" ? "Financial" : perspective.key === "customer" ? "Customer" : perspective.key === "internal-process" ? "Internal Process" : "Learning & Growth";
        const perspectiveRows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO scorecard.perspectives (scorecard_id, name_en, name_ar, "order")
          VALUES (${scorecardId}::uuid, ${nameEn}, ${nameEn}, ${index}) RETURNING id`;
        const perspectiveId = perspectiveRows[0]!.id;

        await tx.$executeRaw`
          INSERT INTO scorecard.balanced_perspective_profiles (
            perspective_id, perspective_key, owner_initials, owner_color, score, prior_score, weight
          ) VALUES (${perspectiveId}::uuid, ${perspective.key}, ${perspective.owner.initials}, ${perspective.owner.color}, ${perspective.score}, ${perspective.priorScore ?? null}, ${perspective.weight})`;

        const kpiIds: string[] = [];
        for (const kpi of perspective.kpis) {
          const kpiRows = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO scorecard.kpi_snapshots (
              perspective_id, name, status, owner_initials, owner_color, score, prior_score, weight, actual, target, variance, trend
            ) VALUES (
              ${perspectiveId}::uuid, ${kpi.name}, ${kpi.status}, ${kpi.owner.initials}, ${kpi.owner.color}, ${kpi.score}, ${kpi.priorScore ?? null}, ${kpi.weight ?? null}, ${kpi.actual ?? null}, ${kpi.target ?? null}, ${kpi.variance ?? null}, ${JSON.stringify(kpi.trend ?? [])}::jsonb
            ) RETURNING id`;
          kpiIds.push(kpiRows[0]!.id);
        }
        createdPerspectives.set(perspective.key, { id: perspectiveId, ownerInitials: perspective.owner.initials, ownerColor: perspective.owner.color, kpiIds });
      }

      await tx.$executeRaw`
        INSERT INTO scorecard.strategy_maps (scorecard_id, state)
        VALUES (${scorecardId}::uuid, 'published'::scorecard.strategy_map_state)`;

      const objectiveName = input.strategicObjective?.trim();
      if (objectiveName) {
        const requestedPerspective = input.primaryPerspective && input.primaryPerspective !== "all" ? input.primaryPerspective : input.perspectives[0]?.key;
        const targetPerspective = requestedPerspective ? createdPerspectives.get(requestedPerspective) : undefined;
        if (targetPerspective) {
          const objectiveRows = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO strategy.strategy_nodes (type, name_en, name_ar, plan_version_id, state, created_by)
            VALUES ('objective'::strategy."StrategyNodeType", ${objectiveName}, ${objectiveName}, ${input.planVersionId}::uuid, 'active'::strategy."StrategyNodeState", ${actorUserId}) RETURNING id`;
          const objectiveNodeId = objectiveRows[0]!.id;
          await tx.$executeRaw`INSERT INTO scorecard.placements (perspective_id, objective_node_id) VALUES (${targetPerspective.id}::uuid, ${objectiveNodeId}::uuid)`;
          await tx.$executeRaw`
            INSERT INTO scorecard.objective_profiles (objective_node_id, scorecard_id, status, progress, owner_name, owner_initials, owner_color, description)
            VALUES (${objectiveNodeId}::uuid, ${scorecardId}::uuid, ${objectiveStatus(input.status)}, ${Math.min(100, Math.max(0, input.score))}, ${input.ownerName}, ${input.ownerInitials ?? targetPerspective.ownerInitials}, ${targetPerspective.ownerColor}, ${input.description ?? null})`;
          for (const kpiId of targetPerspective.kpiIds) {
            await tx.$executeRaw`INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id) VALUES (${objectiveNodeId}::uuid, ${kpiId}::uuid) ON CONFLICT DO NOTHING`;
          }
          await refreshObjectiveFromLinkedKpis(tx, objectiveNodeId);
        }
      }

      return { id: scorecardId };
    });
  }

  async createObjective(input: CreateScorecardObjectiveInput) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ planVersionId: string; perspectiveId: string }>>`
        SELECT s.plan_version_id AS "planVersionId", p.id AS "perspectiveId"
        FROM scorecard.scorecards s
        JOIN scorecard.perspectives p ON p.scorecard_id = s.id
        WHERE s.id = ${input.scorecardId}::uuid AND p.id = ${input.perspectiveId}::uuid`;
      const context = rows[0];
      if (!context) throw new Error("Perspective does not belong to this scorecard");

      const objectiveRows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO strategy.strategy_nodes (type, name_en, name_ar, plan_version_id, state, created_by)
        VALUES ('objective'::strategy."StrategyNodeType", ${input.name.trim()}, ${input.name.trim()}, ${context.planVersionId}::uuid, 'active'::strategy."StrategyNodeState", ${input.actorUserId}) RETURNING id`;
      const objectiveNodeId = objectiveRows[0]!.id;

      await tx.$executeRaw`INSERT INTO scorecard.placements (perspective_id, objective_node_id) VALUES (${input.perspectiveId}::uuid, ${objectiveNodeId}::uuid)`;
      await tx.$executeRaw`
        INSERT INTO scorecard.objective_profiles (objective_node_id, scorecard_id, status, progress, owner_name, owner_initials, owner_color, description)
        VALUES (${objectiveNodeId}::uuid, ${input.scorecardId}::uuid, ${input.status}, ${input.progress}, ${input.ownerName.trim()}, ${input.ownerInitials ?? deriveInitials(input.ownerName)}, ${input.ownerColor ?? "bg-slate-500"}, ${input.description ?? null})`;
      await tx.$executeRaw`
        INSERT INTO scorecard.strategy_maps (scorecard_id, state)
        SELECT ${input.scorecardId}::uuid, 'published'::scorecard.strategy_map_state
        WHERE NOT EXISTS (SELECT 1 FROM scorecard.strategy_maps WHERE scorecard_id = ${input.scorecardId}::uuid AND state = 'published')`;

      const kpiIds = input.kpiSnapshotIds ?? [];
      if (kpiIds.length > 0) {
        const valid = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM scorecard.kpi_snapshots WHERE perspective_id = ${input.perspectiveId}::uuid AND id = ANY(${kpiIds}::uuid[])`;
        if (valid.length !== kpiIds.length) throw new Error("Every linked KPI must belong to the objective perspective");
        for (const kpiId of kpiIds) {
          await tx.$executeRaw`INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id) VALUES (${objectiveNodeId}::uuid, ${kpiId}::uuid) ON CONFLICT DO NOTHING`;
        }
        await refreshObjectiveFromLinkedKpis(tx, objectiveNodeId);
      }
      return { id: objectiveNodeId };
    });
  }

  async updateObjective(input: UpdateScorecardObjectiveInput) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT objective_node_id AS id FROM scorecard.objective_profiles
        WHERE objective_node_id = ${input.objectiveNodeId}::uuid AND scorecard_id = ${input.scorecardId}::uuid`;
      if (!profile[0]) throw new Error("Scorecard objective not found");

      const perspective = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM scorecard.perspectives WHERE id = ${input.perspectiveId}::uuid AND scorecard_id = ${input.scorecardId}::uuid`;
      if (!perspective[0]) throw new Error("Perspective does not belong to this scorecard");

      await tx.$executeRaw`UPDATE strategy.strategy_nodes SET name_en = ${input.name.trim()}, name_ar = ${input.name.trim()} WHERE id = ${input.objectiveNodeId}::uuid`;
      await tx.$executeRaw`
        UPDATE scorecard.objective_profiles
        SET status = ${input.status}, progress = ${input.progress}, owner_name = ${input.ownerName.trim()},
            owner_initials = ${input.ownerInitials ?? deriveInitials(input.ownerName)}, owner_color = ${input.ownerColor ?? "bg-slate-500"},
            description = ${input.description ?? null}, updated_at = NOW()
        WHERE objective_node_id = ${input.objectiveNodeId}::uuid`;
      await tx.$executeRaw`
        DELETE FROM scorecard.placements WHERE objective_node_id = ${input.objectiveNodeId}::uuid
          AND perspective_id IN (SELECT id FROM scorecard.perspectives WHERE scorecard_id = ${input.scorecardId}::uuid)`;
      await tx.$executeRaw`INSERT INTO scorecard.placements (perspective_id, objective_node_id) VALUES (${input.perspectiveId}::uuid, ${input.objectiveNodeId}::uuid)`;

      if (input.kpiSnapshotIds !== undefined) {
        const kpiIds = input.kpiSnapshotIds;
        const valid = kpiIds.length === 0 ? [] : await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM scorecard.kpi_snapshots WHERE perspective_id = ${input.perspectiveId}::uuid AND id = ANY(${kpiIds}::uuid[])`;
        if (valid.length !== kpiIds.length) throw new Error("Every linked KPI must belong to the objective perspective");
        await tx.$executeRaw`DELETE FROM scorecard.objective_kpi_links WHERE objective_node_id = ${input.objectiveNodeId}::uuid`;
        for (const kpiId of kpiIds) {
          await tx.$executeRaw`INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id) VALUES (${input.objectiveNodeId}::uuid, ${kpiId}::uuid) ON CONFLICT DO NOTHING`;
        }
        if (kpiIds.length > 0) await refreshObjectiveFromLinkedKpis(tx, input.objectiveNodeId);
      }
      return { id: input.objectiveNodeId };
    });
  }

  async deleteObjective(input: { scorecardId: string; objectiveNodeId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const profile = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT objective_node_id AS id FROM scorecard.objective_profiles
        WHERE objective_node_id = ${input.objectiveNodeId}::uuid AND scorecard_id = ${input.scorecardId}::uuid`;
      if (!profile[0]) throw new Error("Scorecard objective not found");
      await tx.$executeRaw`
        DELETE FROM scorecard.map_links WHERE strategy_map_id IN (SELECT id FROM scorecard.strategy_maps WHERE scorecard_id = ${input.scorecardId}::uuid)
          AND (from_objective_id = ${input.objectiveNodeId}::uuid OR to_objective_id = ${input.objectiveNodeId}::uuid)`;
      await tx.$executeRaw`DELETE FROM scorecard.placements WHERE objective_node_id = ${input.objectiveNodeId}::uuid AND perspective_id IN (SELECT id FROM scorecard.perspectives WHERE scorecard_id = ${input.scorecardId}::uuid)`;
      await tx.$executeRaw`DELETE FROM scorecard.objective_kpi_links WHERE objective_node_id = ${input.objectiveNodeId}::uuid`;
      await tx.$executeRaw`DELETE FROM scorecard.objective_profiles WHERE objective_node_id = ${input.objectiveNodeId}::uuid`;
      await tx.$executeRaw`UPDATE strategy.strategy_nodes SET state = 'retired'::strategy."StrategyNodeState" WHERE id = ${input.objectiveNodeId}::uuid`;
      return { removed: true as const };
    });
  }

  async createKpi(input: CreateScorecardKpiInput) {
    return this.prisma.$transaction(async (tx) => {
      const perspective = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM scorecard.perspectives WHERE id = ${input.perspectiveId}::uuid AND scorecard_id = ${input.scorecardId}::uuid`;
      if (!perspective[0]) throw new Error("Perspective does not belong to this scorecard");
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        INSERT INTO scorecard.kpi_snapshots (perspective_id, name, status, owner_initials, owner_color, score, prior_score, weight, actual, target, variance, trend)
        VALUES (${input.perspectiveId}::uuid, ${input.name.trim()}, ${input.status}, ${input.ownerInitials}, ${input.ownerColor}, ${input.score}, ${input.priorScore ?? null}, ${input.weight ?? null}, ${input.actual ?? null}, ${input.target ?? null}, ${input.variance ?? null}, ${JSON.stringify(input.trend ?? [])}::jsonb)
        RETURNING id`;
      const kpiSnapshotId = rows[0]!.id;
      const objectiveIds = input.objectiveNodeIds ?? [];
      for (const objectiveId of objectiveIds) {
        const valid = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT op.objective_node_id AS id FROM scorecard.objective_profiles op
          JOIN scorecard.placements pl ON pl.objective_node_id = op.objective_node_id
          WHERE op.scorecard_id = ${input.scorecardId}::uuid AND op.objective_node_id = ${objectiveId}::uuid AND pl.perspective_id = ${input.perspectiveId}::uuid`;
        if (!valid[0]) throw new Error("Linked objective must belong to the same scorecard perspective");
        await tx.$executeRaw`INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id) VALUES (${objectiveId}::uuid, ${kpiSnapshotId}::uuid) ON CONFLICT DO NOTHING`;
        await refreshObjectiveFromLinkedKpis(tx, objectiveId);
      }
      return { id: kpiSnapshotId };
    });
  }

  async updateKpi(input: UpdateScorecardKpiInput) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.$queryRaw<Array<{ perspectiveId: string }>>`
        SELECT k.perspective_id AS "perspectiveId" FROM scorecard.kpi_snapshots k
        JOIN scorecard.perspectives p ON p.id = k.perspective_id
        WHERE k.id = ${input.kpiSnapshotId}::uuid AND p.scorecard_id = ${input.scorecardId}::uuid`;
      if (!row[0]) throw new Error("Scorecard KPI not found");
      const previousLinks = await tx.$queryRaw<Array<{ id: string }>>`SELECT objective_node_id AS id FROM scorecard.objective_kpi_links WHERE kpi_snapshot_id = ${input.kpiSnapshotId}::uuid`;
      await tx.$executeRaw`
        UPDATE scorecard.kpi_snapshots
        SET name = ${input.name.trim()}, status = ${input.status}, owner_initials = ${input.ownerInitials}, owner_color = ${input.ownerColor},
            score = ${input.score}, prior_score = ${input.priorScore ?? null}, weight = ${input.weight ?? null}, actual = ${input.actual ?? null},
            target = ${input.target ?? null}, variance = ${input.variance ?? null}, trend = ${JSON.stringify(input.trend ?? [])}::jsonb, updated_at = NOW()
        WHERE id = ${input.kpiSnapshotId}::uuid`;
      if (input.objectiveNodeIds !== undefined) {
        await tx.$executeRaw`DELETE FROM scorecard.objective_kpi_links WHERE kpi_snapshot_id = ${input.kpiSnapshotId}::uuid`;
        for (const objectiveId of input.objectiveNodeIds) {
          const valid = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT op.objective_node_id AS id FROM scorecard.objective_profiles op
            JOIN scorecard.placements pl ON pl.objective_node_id = op.objective_node_id
            WHERE op.scorecard_id = ${input.scorecardId}::uuid AND op.objective_node_id = ${objectiveId}::uuid AND pl.perspective_id = ${row[0].perspectiveId}::uuid`;
          if (!valid[0]) throw new Error("Linked objective must belong to the same scorecard perspective");
          await tx.$executeRaw`INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id) VALUES (${objectiveId}::uuid, ${input.kpiSnapshotId}::uuid) ON CONFLICT DO NOTHING`;
        }
      }
      const affected = new Set([...previousLinks.map((item) => item.id), ...(input.objectiveNodeIds ?? [])]);
      for (const objectiveId of affected) await refreshObjectiveFromLinkedKpis(tx, objectiveId);
      return { id: input.kpiSnapshotId };
    });
  }

  async deleteKpi(input: { scorecardId: string; kpiSnapshotId: string }) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT k.id FROM scorecard.kpi_snapshots k JOIN scorecard.perspectives p ON p.id = k.perspective_id
        WHERE k.id = ${input.kpiSnapshotId}::uuid AND p.scorecard_id = ${input.scorecardId}::uuid`;
      if (!row[0]) throw new Error("Scorecard KPI not found");
      const links = await tx.$queryRaw<Array<{ id: string }>>`SELECT objective_node_id AS id FROM scorecard.objective_kpi_links WHERE kpi_snapshot_id = ${input.kpiSnapshotId}::uuid`;
      await tx.$executeRaw`DELETE FROM scorecard.kpi_snapshots WHERE id = ${input.kpiSnapshotId}::uuid`;
      for (const link of links) await refreshObjectiveFromLinkedKpis(tx, link.id);
      return { removed: true as const };
    });
  }
}
