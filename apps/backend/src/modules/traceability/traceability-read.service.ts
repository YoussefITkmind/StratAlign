import type { PrismaService } from "../../database/prisma.service";

type InitiativeStage = "design" | "pilot" | "execute" | "scale" | "done";

export interface FullTraceReadModel {
  objective: { id: string; nameEn: string; nameAr: string; planVersionId: string };
  plays: Array<{
    id: string;
    nameEn: string;
    nameAr: string;
    initiatives: Array<{
      id: string;
      nameEn: string;
      nameAr: string;
      strategicPlayNodeId: string;
      ownerUserId: string;
      stage: InitiativeStage;
      createdAt: Date;
      updatedAt: Date;
      jiraLink: null | {
        id: string;
        jiraProjectKey: string;
        jiraProjectUrl: string;
        lastSyncedAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      };
      milestones: Array<{
        id: string;
        nameEn: string;
        nameAr: string;
        dueDate: Date;
        forecastDate: Date | null;
        health: "on_time" | "at_risk" | "late";
        source: "manual" | "jira";
        createdAt: Date;
      }>;
    }>;
  }>;
  kpis: Array<{
    kpiDefinitionId: string;
    alignmentType: "objective" | "play" | "sector" | "project" | "theme";
    activeVersion: null | {
      versionId: string;
      version: number;
      nameEn: string;
      nameAr: string;
      unit: string;
      polarity: "higher_is_better" | "lower_is_better";
      frequency: "monthly" | "quarterly";
    };
    latestStatus: null | {
      id: string;
      period: string;
      status: string;
      computedAt: Date;
    };
  }>;
}

interface ObjectiveRow { id: string; name_en: string; name_ar: string; plan_version_id: string }
interface PlayRow { id: string; name_en: string; name_ar: string }
interface InitiativeRow {
  id: string; name_en: string; name_ar: string; strategic_play_node_id: string;
  owner_user_id: string; stage: InitiativeStage; created_at: Date; updated_at: Date;
}
interface JiraRow {
  id: string; initiative_id: string; jira_project_key: string; jira_project_url: string;
  last_synced_at: Date | null; created_at: Date; updated_at: Date;
}
interface MilestoneRow {
  id: string; jira_link_id: string; name_en: string; name_ar: string; due_date: Date;
  forecast_date: Date | null; health: "on_time" | "at_risk" | "late";
  source: "manual" | "jira"; created_at: Date;
}
interface KpiRow {
  alignment_id: string; kpi_definition_id: string;
  alignment_type: "objective" | "play" | "sector" | "project" | "theme";
  version_id: string | null; version: number | null; name_en: string | null; name_ar: string | null;
  unit: string | null; polarity: "higher_is_better" | "lower_is_better" | null;
  frequency: "monthly" | "quarterly" | null;
  status_id: string | null; status_period: string | null; status: string | null; status_computed_at: Date | null;
}

export class TraceabilityReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getFullTrace(nodeId: string): Promise<FullTraceReadModel> {
    const [objective] = await this.prisma.$queryRaw<ObjectiveRow[]>`
      SELECT id, name_en, name_ar, plan_version_id
      FROM "strategy"."strategy_nodes"
      WHERE id = ${nodeId}::uuid
        AND type = 'objective'::"strategy"."StrategyNodeType"
    `;
    if (!objective) throw new Error("Strategy objective not found");

    const [plays, kpiRows] = await Promise.all([
      this.prisma.$queryRaw<PlayRow[]>`
        SELECT play.id, play.name_en, play.name_ar
        FROM "strategy"."strategy_edges" edge
        JOIN "strategy"."strategy_nodes" play ON play.id = edge.to_node_id
        WHERE edge.from_node_id = ${objective.id}::uuid
          AND edge.edge_type = 'executed_by'::"strategy"."StrategyEdgeType"
          AND edge.plan_version_id = ${objective.plan_version_id}::uuid
          AND play.plan_version_id = ${objective.plan_version_id}::uuid
          AND play.type = 'strategic_play'::"strategy"."StrategyNodeType"
        ORDER BY play.name_en ASC, play.id ASC
      `,
      this.prisma.$queryRaw<KpiRow[]>`
        SELECT
          alignment.id AS alignment_id,
          definition.id AS kpi_definition_id,
          alignment.alignment_type,
          version.id AS version_id,
          version.version,
          version.name_en,
          version.name_ar,
          version.unit,
          version.polarity,
          version.frequency,
          latest_status.id AS status_id,
          latest_status.period AS status_period,
          latest_status.status,
          latest_status.computed_at AS status_computed_at
        FROM "registry"."alignments" alignment
        JOIN "registry"."kpi_definitions" definition ON definition.id = alignment.kpi_definition_id
        LEFT JOIN "registry"."kpi_versions" version ON version.id = definition.active_version_id
        LEFT JOIN LATERAL (
          SELECT status_result.id, status_result.period, status_result.status, status_result.computed_at
          FROM "performance"."status_results" status_result
          WHERE status_result.kpi_version_id = definition.active_version_id
            AND status_result.scope_node_id = ${objective.id}::uuid
          ORDER BY status_result.computed_at DESC, status_result.id DESC
          LIMIT 1
        ) latest_status ON true
        WHERE alignment.strategy_node_id = ${objective.id}::uuid
        ORDER BY version.name_en ASC NULLS LAST, definition.id, alignment.alignment_type, alignment.id
      `,
    ]);

    const playIds = plays.map((play) => play.id);
    const initiatives = playIds.length === 0 ? [] : await this.prisma.$queryRaw<InitiativeRow[]>`
      SELECT id, name_en, name_ar, strategic_play_node_id, owner_user_id, stage, created_at, updated_at
      FROM "execution"."initiatives"
      WHERE strategic_play_node_id = ANY(${playIds}::uuid[])
      ORDER BY name_en ASC, id ASC
    `;
    const initiativeIds = initiatives.map((initiative) => initiative.id);
    const jiraLinks = initiativeIds.length === 0 ? [] : await this.prisma.$queryRaw<JiraRow[]>`
      SELECT id, initiative_id, jira_project_key, jira_project_url, last_synced_at, created_at, updated_at
      FROM "execution"."jira_links"
      WHERE initiative_id = ANY(${initiativeIds}::uuid[])
      ORDER BY initiative_id ASC, id ASC
    `;
    const jiraIds = jiraLinks.map((jira) => jira.id);
    const milestones = jiraIds.length === 0 ? [] : await this.prisma.$queryRaw<MilestoneRow[]>`
      SELECT id, jira_link_id, name_en, name_ar, due_date, forecast_date, health, source, created_at
      FROM "execution"."milestone_flags"
      WHERE jira_link_id = ANY(${jiraIds}::uuid[])
      ORDER BY due_date ASC, id ASC
    `;

    const jiraByInitiative = new Map(jiraLinks.map((jira) => [jira.initiative_id, jira]));
    const milestonesByJira = new Map<string, MilestoneRow[]>();
    for (const milestone of milestones) {
      const rows = milestonesByJira.get(milestone.jira_link_id) ?? [];
      rows.push(milestone);
      milestonesByJira.set(milestone.jira_link_id, rows);
    }

    return {
      objective: { id: objective.id, nameEn: objective.name_en, nameAr: objective.name_ar, planVersionId: objective.plan_version_id },
      plays: plays.map((play) => ({
        id: play.id,
        nameEn: play.name_en,
        nameAr: play.name_ar,
        initiatives: initiatives.filter((initiative) => initiative.strategic_play_node_id === play.id).map((initiative) => {
          const jira = jiraByInitiative.get(initiative.id) ?? null;
          return {
            id: initiative.id,
            nameEn: initiative.name_en,
            nameAr: initiative.name_ar,
            strategicPlayNodeId: initiative.strategic_play_node_id,
            ownerUserId: initiative.owner_user_id,
            stage: initiative.stage,
            createdAt: initiative.created_at,
            updatedAt: initiative.updated_at,
            jiraLink: jira ? {
              id: jira.id,
              jiraProjectKey: jira.jira_project_key,
              jiraProjectUrl: jira.jira_project_url,
              lastSyncedAt: jira.last_synced_at,
              createdAt: jira.created_at,
              updatedAt: jira.updated_at,
            } : null,
            milestones: jira ? (milestonesByJira.get(jira.id) ?? []).map((milestone) => ({
              id: milestone.id,
              nameEn: milestone.name_en,
              nameAr: milestone.name_ar,
              dueDate: milestone.due_date,
              forecastDate: milestone.forecast_date,
              health: milestone.health,
              source: milestone.source,
              createdAt: milestone.created_at,
            })) : [],
          };
        }),
      })),
      kpis: kpiRows.map((kpi) => ({
        kpiDefinitionId: kpi.kpi_definition_id,
        alignmentType: kpi.alignment_type,
        activeVersion: kpi.version_id === null ? null : {
          versionId: kpi.version_id,
          version: kpi.version!,
          nameEn: kpi.name_en!,
          nameAr: kpi.name_ar!,
          unit: kpi.unit!,
          polarity: kpi.polarity!,
          frequency: kpi.frequency!,
        },
        latestStatus: kpi.status_id === null ? null : {
          id: kpi.status_id,
          period: kpi.status_period!,
          status: kpi.status!,
          computedAt: kpi.status_computed_at!,
        },
      })),
    };
  }
}
