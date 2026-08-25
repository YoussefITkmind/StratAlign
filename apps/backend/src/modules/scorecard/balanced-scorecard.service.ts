import type { PrismaService } from "../../database/prisma.service";

type ScorecardStatus = "on-track" | "at-risk" | "draft";
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
  actorUserId: string;
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

function objectiveStatus(status: ScorecardStatus): "on-track" | "at-risk" | "not-started" {
  if (status === "on-track") return "on-track";
  if (status === "at-risk") return "at-risk";
  return "not-started";
}

export class BalancedScorecardService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [scorecards, perspectives, kpis] = await Promise.all([
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
    ]);

    const kpisByPerspective = new Map<string, KpiRow[]>();
    for (const kpi of kpis) {
      const rows = kpisByPerspective.get(kpi.perspectiveId) ?? [];
      rows.push(kpi);
      kpisByPerspective.set(kpi.perspectiveId, rows);
    }

    const perspectivesByScorecard = new Map<string, PerspectiveRow[]>();
    for (const perspective of perspectives) {
      const rows = perspectivesByScorecard.get(perspective.scorecardId) ?? [];
      rows.push(perspective);
      perspectivesByScorecard.set(perspective.scorecardId, rows);
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

      const createdPerspectives = new Map<PerspectiveKey, {
        id: string;
        ownerInitials: string;
        ownerColor: string;
        kpiIds: string[];
      }>();

      for (const [index, perspective] of input.perspectives.entries()) {
        const nameEn = perspective.key === "financial"
          ? "Financial"
          : perspective.key === "customer"
            ? "Customer"
            : perspective.key === "internal-process"
              ? "Internal Process"
              : "Learning & Growth";

        const perspectiveRows = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO scorecard.perspectives (scorecard_id, name_en, name_ar, "order")
          VALUES (${scorecardId}::uuid, ${nameEn}, ${nameEn}, ${index})
          RETURNING id`;
        const perspectiveId = perspectiveRows[0]!.id;

        await tx.$executeRaw`
          INSERT INTO scorecard.balanced_perspective_profiles (
            perspective_id, perspective_key, owner_initials, owner_color, score, prior_score, weight
          ) VALUES (
            ${perspectiveId}::uuid, ${perspective.key}, ${perspective.owner.initials}, ${perspective.owner.color},
            ${perspective.score}, ${perspective.priorScore ?? null}, ${perspective.weight}
          )`;

        const kpiIds: string[] = [];
        for (const kpi of perspective.kpis) {
          const kpiRows = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO scorecard.kpi_snapshots (
              perspective_id, name, status, owner_initials, owner_color,
              score, prior_score, weight, actual, target, variance, trend
            ) VALUES (
              ${perspectiveId}::uuid, ${kpi.name}, ${kpi.status}, ${kpi.owner.initials}, ${kpi.owner.color},
              ${kpi.score}, ${kpi.priorScore ?? null}, ${kpi.weight ?? null}, ${kpi.actual ?? null}, ${kpi.target ?? null}, ${kpi.variance ?? null},
              ${JSON.stringify(kpi.trend ?? [])}::jsonb
            )
            RETURNING id`;
          kpiIds.push(kpiRows[0]!.id);
        }

        createdPerspectives.set(perspective.key, {
          id: perspectiveId,
          ownerInitials: perspective.owner.initials,
          ownerColor: perspective.owner.color,
          kpiIds,
        });
      }

      await tx.$executeRaw`
        INSERT INTO scorecard.strategy_maps (scorecard_id, state)
        VALUES (${scorecardId}::uuid, 'published'::scorecard.strategy_map_state)`;

      const objectiveName = input.strategicObjective?.trim();
      if (objectiveName) {
        const requestedPerspective = input.primaryPerspective && input.primaryPerspective !== "all"
          ? input.primaryPerspective
          : input.perspectives[0]?.key;
        const targetPerspective = requestedPerspective
          ? createdPerspectives.get(requestedPerspective)
          : undefined;

        if (targetPerspective) {
          const objectiveRows = await tx.$queryRaw<Array<{ id: string }>>`
            INSERT INTO strategy.strategy_nodes (
              type, name_en, name_ar, plan_version_id, state, created_by
            ) VALUES (
              'objective'::strategy."StrategyNodeType",
              ${objectiveName},
              ${objectiveName},
              ${input.planVersionId}::uuid,
              'active'::strategy."StrategyNodeState",
              ${input.actorUserId}
            )
            RETURNING id`;
          const objectiveNodeId = objectiveRows[0]!.id;

          await tx.$executeRaw`
            INSERT INTO scorecard.placements (perspective_id, objective_node_id)
            VALUES (${targetPerspective.id}::uuid, ${objectiveNodeId}::uuid)`;

          await tx.$executeRaw`
            INSERT INTO scorecard.objective_profiles (
              objective_node_id, scorecard_id, status, progress,
              owner_name, owner_initials, owner_color, description
            ) VALUES (
              ${objectiveNodeId}::uuid,
              ${scorecardId}::uuid,
              ${objectiveStatus(input.status)},
              ${Math.min(100, Math.max(0, input.score))},
              ${input.ownerName},
              ${input.ownerInitials ?? targetPerspective.ownerInitials},
              ${targetPerspective.ownerColor},
              ${input.description ?? null}
            )`;

          for (const kpiId of targetPerspective.kpiIds) {
            await tx.$executeRaw`
              INSERT INTO scorecard.objective_kpi_links (objective_node_id, kpi_snapshot_id)
              VALUES (${objectiveNodeId}::uuid, ${kpiId}::uuid)
              ON CONFLICT DO NOTHING`;
          }
        }
      }

      return { id: scorecardId };
    });
  }
}
