import type { PrismaService } from "../../database/prisma.service";

type KpiPerspective = "financial" | "customer" | "internal" | "learning";
type KpiStatus = "on-track" | "at-risk" | "behind";
type KpiApproval = "draft" | "pending" | "approved";

type ObjectiveContextRow = {
  id: string;
  name: string;
  department: string | null;
  period: string | null;
  ownerName: string | null;
  perspectiveName: string | null;
};

type KpiRow = {
  definitionId: string;
  definitionStatus: string;
  activeVersionId: string | null;
  versionId: string;
  name: string;
  description: string | null;
  unit: string;
  polarity: string;
  frequency: string;
  dataSourceType: string;
  approvalCaseId: string | null;
  publishedAt: Date | null;
  ownerName: string | null;
  ownerEmail: string;
  alignedObjectiveId: string | null;
  alignedObjectiveName: string | null;
};

type MeasurementRow = {
  kpiVersionId: string;
  period: string;
  value: unknown;
  createdAt: Date;
};

type TargetRow = {
  kpiVersionId: string;
  period: string;
  targetValue: unknown;
  updatedAt: Date;
};

type OkrRow = {
  id: string;
  objectiveNodeId: string;
  name: string;
};

type KeyResultRow = {
  id: string;
  okrId: string;
  title: string | null;
  targetValue: unknown;
  currentValue: unknown | null;
  unit: string;
  progressUpdatedAt: Date | null;
};

const OWNER_COLORS = [
  "bg-blue-600",
  "bg-emerald-600",
  "bg-amber-600",
  "bg-rose-600",
  "bg-cyan-600",
  "bg-violet-600",
];

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
    .slice(0, 2) || "?";
}

function hash(value: string): number {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = ((result << 5) - result + value.charCodeAt(index)) | 0;
  }
  return Math.abs(result);
}

function owner(name: string) {
  return {
    initials: initials(name),
    name,
    color: OWNER_COLORS[hash(name) % OWNER_COLORS.length]!,
  };
}

function perspective(name: string | null): KpiPerspective {
  const normalized = (name ?? "").trim().toLowerCase();
  if (normalized.includes("financial")) return "financial";
  if (normalized.includes("customer")) return "customer";
  if (normalized.includes("learning")) return "learning";
  return "internal";
}

function number(value: unknown | null): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumber(value: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "—";
  const normalized = unit.trim().toLowerCase();
  if (normalized === "%" || normalized === "percent" || normalized === "percentage") {
    return `${formatNumber(value)}%`;
  }
  if (normalized === "$" || normalized === "usd") return `$${formatNumber(value)}`;
  if (normalized === "$m" || normalized === "usd m" || normalized === "usd millions") return `$${formatNumber(value)}M`;
  if (normalized === "$k" || normalized === "usd k") return `$${formatNumber(value)}K`;
  if (normalized === "score" || normalized === "count" || normalized === "x") return formatNumber(value);
  if (normalized === "days" || normalized === "day") return `${formatNumber(value)} days`;
  if (normalized === "hours" || normalized === "hrs" || normalized === "hour") return `${formatNumber(value)} hrs`;
  if (normalized === "points" || normalized === "pts") return `${formatNumber(value)} pts`;
  return `${formatNumber(value)} ${unit}`.trim();
}

function variance(actual: number | null, target: number | null, unit: string): string {
  if (actual === null || target === null) return "—";
  const delta = actual - target;
  const formatted = formatValue(Math.abs(delta), unit);
  if (formatted.startsWith("$")) return `${delta < 0 ? "-" : "+"}${formatted}`;
  return `${delta > 0 ? "+" : delta < 0 ? "-" : ""}${formatted}`;
}

function achievement(actual: number | null, target: number | null, polarity: string): number | null {
  if (actual === null || target === null) return null;
  if (polarity.toLowerCase().includes("lower")) {
    if (actual <= 0) return target >= 0 ? 100 : 0;
    return (target / actual) * 100;
  }
  if (target === 0) return actual >= 0 ? 100 : 0;
  return (actual / target) * 100;
}

function performanceStatus(actual: number | null, target: number | null, polarity: string): KpiStatus {
  const ratio = achievement(actual, target, polarity);
  if (ratio === null) return "at-risk";
  if (ratio >= 95) return "on-track";
  if (ratio >= 80) return "at-risk";
  return "behind";
}

function favorable(actual: number | null, target: number | null, polarity: string): boolean {
  if (actual === null || target === null) return true;
  return polarity.toLowerCase().includes("lower") ? actual <= target : actual >= target;
}

function approval(status: string, publishedAt: Date | null, approvalCaseId: string | null): KpiApproval {
  if (publishedAt && status.toLowerCase() === "active") return "approved";
  if (approvalCaseId) return "pending";
  return "draft";
}

function latestByPeriod<T extends { period: string }>(rows: T[]): T | null {
  return rows.length === 0 ? null : [...rows].sort((a, b) => a.period.localeCompare(b.period)).at(-1) ?? null;
}

function keyResultProgress(title: string, current: number | null, target: number): number {
  if (current === null || target === 0) return 0;
  const lowerIsBetter = /^(reduce|lower|decrease|minimi[sz]e|shorten|cut)\b/i.test(title.trim());
  const raw = lowerIsBetter && current > 0 ? (target / current) * 100 : (current / target) * 100;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

export class KpiOkrWorkspaceService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const [objectiveRows, kpiRows, measurements, targets, okrs, keyResults] = await Promise.all([
      this.prisma.$queryRaw<ObjectiveContextRow[]>`
        SELECT DISTINCT ON (op.objective_node_id)
          op.objective_node_id AS id,
          n.name_en AS name,
          bp.department,
          bp.period,
          op.owner_name AS "ownerName",
          p.name_en AS "perspectiveName"
        FROM scorecard.objective_profiles op
        JOIN strategy.strategy_nodes n ON n.id = op.objective_node_id
        JOIN scorecard.placements pl ON pl.objective_node_id = op.objective_node_id
        JOIN scorecard.perspectives p ON p.id = pl.perspective_id AND p.scorecard_id = op.scorecard_id
        LEFT JOIN scorecard.balanced_scorecard_profiles bp ON bp.scorecard_id = op.scorecard_id
        WHERE n.state <> 'retired'::strategy."StrategyNodeState"
        ORDER BY op.objective_node_id, p."order", p.id`,
      this.prisma.$queryRaw<KpiRow[]>`
        SELECT DISTINCT ON (kd.id)
          kd.id AS "definitionId",
          kd.status::text AS "definitionStatus",
          kd.active_version_id AS "activeVersionId",
          kv.id AS "versionId",
          kv.name_en AS name,
          kv.description_en AS description,
          kv.unit,
          kv.polarity::text AS polarity,
          kv.frequency::text AS frequency,
          kv.data_source_type::text AS "dataSourceType",
          kv.approval_case_id AS "approvalCaseId",
          kv.published_at AS "publishedAt",
          u.display_name AS "ownerName",
          u.email AS "ownerEmail",
          a.strategy_node_id AS "alignedObjectiveId",
          n.name_en AS "alignedObjectiveName"
        FROM registry.kpi_definitions kd
        JOIN LATERAL (
          SELECT version.*
          FROM registry.kpi_versions version
          WHERE version.kpi_definition_id = kd.id
          ORDER BY (version.id = kd.active_version_id) DESC, version.version DESC
          LIMIT 1
        ) kv ON TRUE
        JOIN iam.users u ON u.id = kv.owner_user_id
        LEFT JOIN LATERAL (
          SELECT alignment.strategy_node_id
          FROM registry.alignments alignment
          WHERE alignment.kpi_definition_id = kd.id
            AND alignment.alignment_type = 'objective'::registry."AlignmentType"
          ORDER BY alignment.created_at, alignment.id
          LIMIT 1
        ) a ON TRUE
        LEFT JOIN strategy.strategy_nodes n ON n.id = a.strategy_node_id
        WHERE kd.status::text <> 'retired'
        ORDER BY kd.id, kv.version DESC`,
      this.prisma.$queryRaw<MeasurementRow[]>`
        SELECT m.kpi_version_id AS "kpiVersionId", m.period, m.value, m.created_at AS "createdAt"
        FROM performance.measurements m
        JOIN registry.kpi_versions kv ON kv.id = m.kpi_version_id
        JOIN registry.kpi_definitions kd ON kd.id = kv.kpi_definition_id
        WHERE kd.status::text <> 'retired'
        ORDER BY m.kpi_version_id, m.period, m.created_at`,
      this.prisma.$queryRaw<TargetRow[]>`
        SELECT t.kpi_version_id AS "kpiVersionId", t.period, t.target_value AS "targetValue", t.updated_at AS "updatedAt"
        FROM performance.target_series t
        JOIN registry.kpi_versions kv ON kv.id = t.kpi_version_id
        JOIN registry.kpi_definitions kd ON kd.id = kv.kpi_definition_id
        WHERE kd.status::text <> 'retired'
        ORDER BY t.kpi_version_id, t.period, t.updated_at`,
      this.prisma.$queryRaw<OkrRow[]>`
        SELECT id, objective_node_id AS "objectiveNodeId", name_en AS name
        FROM registry.okrs
        ORDER BY created_at, id`,
      this.prisma.$queryRaw<KeyResultRow[]>`
        SELECT id, okr_id AS "okrId", title_en AS title, target_value AS "targetValue",
               current_value AS "currentValue", unit, progress_updated_at AS "progressUpdatedAt"
        FROM registry.key_results
        ORDER BY created_at, id`,
    ]);

    const objectiveContext = new Map(objectiveRows.map((row) => [row.id, row]));
    const measurementsByVersion = new Map<string, MeasurementRow[]>();
    const targetsByVersion = new Map<string, TargetRow[]>();

    for (const row of measurements) {
      measurementsByVersion.set(row.kpiVersionId, [...(measurementsByVersion.get(row.kpiVersionId) ?? []), row]);
    }
    for (const row of targets) {
      targetsByVersion.set(row.kpiVersionId, [...(targetsByVersion.get(row.kpiVersionId) ?? []), row]);
    }

    const kpis = kpiRows.map((row) => {
      const allMeasurements = measurementsByVersion.get(row.versionId) ?? [];
      const allTargets = targetsByVersion.get(row.versionId) ?? [];
      const latestMeasurement = latestByPeriod(allMeasurements);
      const targetForPeriod = latestMeasurement
        ? latestByPeriod(allTargets.filter((target) => target.period === latestMeasurement.period))
        : latestByPeriod(allTargets);
      const latestTarget = targetForPeriod ?? latestByPeriod(allTargets);
      const actualValue = number(latestMeasurement?.value ?? null);
      const targetValue = number(latestTarget?.targetValue ?? null);
      const context = row.alignedObjectiveId ? objectiveContext.get(row.alignedObjectiveId) : undefined;
      const ownerName = row.ownerName?.trim() || row.ownerEmail;
      const trend = allMeasurements
        .slice(-6)
        .map((item) => number(item.value))
        .filter((value): value is number => value !== null);

      return {
        id: row.definitionId,
        versionId: row.versionId,
        name: row.name,
        tag: row.alignedObjectiveName ?? "Unaligned KPI",
        perspective: perspective(context?.perspectiveName ?? null),
        department: context?.department ?? "Enterprise",
        owner: owner(ownerName),
        actual: formatValue(actualValue, row.unit),
        target: formatValue(targetValue, row.unit),
        variance: variance(actualValue, targetValue, row.unit),
        favorable: favorable(actualValue, targetValue, row.polarity),
        trend,
        freq: row.frequency.toLowerCase() === "quarterly" ? "Quarterly" as const : "Monthly" as const,
        approval: approval(row.definitionStatus, row.publishedAt, row.approvalCaseId),
        status: performanceStatus(actualValue, targetValue, row.polarity),
        description: row.description ?? undefined,
        unit: row.unit,
        polarity: row.polarity.toLowerCase().includes("lower") ? "lower_is_better" as const : "higher_is_better" as const,
        dataSourceType: row.dataSourceType.toLowerCase() === "feed" ? "feed" as const : "manual" as const,
        period: latestMeasurement?.period ?? latestTarget?.period ?? context?.period ?? undefined,
        alignedObjectiveId: row.alignedObjectiveId ?? undefined,
      };
    });

    const keyResultsByOkr = new Map<string, KeyResultRow[]>();
    for (const keyResult of keyResults) {
      keyResultsByOkr.set(keyResult.okrId, [...(keyResultsByOkr.get(keyResult.okrId) ?? []), keyResult]);
    }

    const okrViews = okrs.map((okr) => {
      const context = objectiveContext.get(okr.objectiveNodeId);
      const okrOwner = owner(context?.ownerName ?? "Unassigned");
      const rows = keyResultsByOkr.get(okr.id) ?? [];
      const krViews = rows.map((keyResult) => {
        const current = number(keyResult.currentValue);
        const target = number(keyResult.targetValue) ?? 0;
        const title = keyResult.title?.trim() || "Key Result";
        const progress = keyResultProgress(title, current, target);
        return {
          id: keyResult.id,
          label: title,
          actual: formatValue(current, keyResult.unit),
          target: formatValue(target, keyResult.unit),
          progress,
          owner: okrOwner,
          status: progress >= 75 ? "on-track" as const : progress >= 50 ? "at-risk" as const : "behind" as const,
          updatedAt: keyResult.progressUpdatedAt?.toISOString() ?? "Not updated",
          unit: keyResult.unit,
        };
      });
      const progress = krViews.length === 0 ? 0 : Math.round(krViews.reduce((sum, item) => sum + item.progress, 0) / krViews.length);

      return {
        id: okr.id,
        objectiveNodeId: okr.objectiveNodeId,
        title: okr.name,
        department: context?.department ?? "Enterprise",
        quarter: context?.period ?? "Current Period",
        owner: okrOwner,
        status: progress >= 75 ? "on-track" as const : progress >= 50 ? "at-risk" as const : "behind" as const,
        progress,
        keyResults: krViews,
      };
    });

    const objectives = objectiveRows.map((row) => ({
      id: row.id,
      name: row.name,
      department: row.department ?? "Enterprise",
      perspective: perspective(row.perspectiveName),
      period: row.period ?? "Current Period",
      owner: owner(row.ownerName ?? "Unassigned"),
    }));

    return { kpis, okrs: okrViews, objectives };
  }
}
