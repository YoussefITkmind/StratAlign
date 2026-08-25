import type { PrismaService } from "../../database/prisma.service";
import { executionErrors } from "./execution.errors";

export type InitiativeStage = "design" | "pilot" | "execute" | "scale" | "done";
export type InitiativeStatus = "on_track" | "at_risk" | "off_track";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ExecutionSource = "manual" | "erp" | "jira";
export type RiskLevel = "low" | "medium" | "high";
export type Priority = "critical" | "high" | "medium" | "low";

export interface InitiativeView {
  id: string;
  nameEn: string;
  nameAr: string;
  strategicPlayNodeId: string;
  ownerUserId: string;
  stage: InitiativeStage;
  priority: Priority;
  department: string | null;
  startDate: Date | null;
  endDate: Date | null;
  tags: string[];
  createdAt: Date;
}

export interface ProjectView {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  ownerUserId: string;
  parentInitiativeId: string | null;
  startDate: Date | null;
  endDate: Date | null;
  budgetAmount: string | null;
  priority: Priority;
  jiraBoardUrl: string | null;
  confluenceSpaceUrl: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface InitiativeListItemView {
  id: string;
  nameEn: string;
  nameAr: string;
  strategicPlayNodeId: string;
  ownerUserId: string;
  ownerDisplayName: string | null;
  stage: InitiativeStage;
  latestStatus: InitiativeStatus | null;
  latestConfidence: ConfidenceLevel | null;
  hasJiraLink: boolean;
  linkedProjectCount: number;
  updatedAt: Date;
}

export interface InitiativeDetailView {
  id: string;
  nameEn: string;
  nameAr: string;
  strategicPlayNodeId: string;
  ownerUserId: string;
  stage: InitiativeStage;
  createdAt: Date;
  updatedAt: Date;
  owner: { id: string; displayName: string | null };
  strategicPlay: { id: string; nameEn: string; nameAr: string; planVersionId: string };
  objectives: Array<{ id: string; nameEn: string; nameAr: string }>;
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
  latestStatus: null | Omit<StatusUpdateView, "initiativeId">;
}

export interface StatusUpdateView {
  id: string;
  initiativeId: string;
  period: string;
  stage: InitiativeStage;
  status: InitiativeStatus;
  confidence: ConfidenceLevel;
  narrativeEn: string | null;
  narrativeAr: string | null;
  submittedBy: string;
  createdAt: Date;
}

interface InitiativeRow {
  id: string;
  name_en: string;
  name_ar: string;
  strategic_play_node_id: string;
  owner_user_id: string;
  stage: InitiativeStage;
  priority: Priority;
  department: string | null;
  start_date: Date | null;
  end_date: Date | null;
  tags: string[];
  created_at: Date;
}

interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  department: string | null;
  owner_user_id: string;
  parent_initiative_id: string | null;
  start_date: Date | null;
  end_date: Date | null;
  budget_amount: string | null;
  priority: Priority;
  jira_board_url: string | null;
  confluence_space_url: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

interface InitiativeListRow {
  id: string;
  name_en: string;
  name_ar: string;
  strategic_play_node_id: string;
  owner_user_id: string;
  owner_display_name: string | null;
  stage: InitiativeStage;
  updated_at: Date;
  latest_status: InitiativeStatus | null;
  latest_confidence: ConfidenceLevel | null;
  has_jira_link: boolean;
  linked_project_count: number;
  play_owned_by_actor: boolean;
}

interface InitiativeDetailRow extends InitiativeRow {
  updated_at: Date;
  owner_display_name: string | null;
  play_id: string | null;
  play_name_en: string | null;
  play_name_ar: string | null;
  play_plan_version_id: string | null;
}

interface StatusRow {
  id: string;
  initiative_id: string;
  period: string;
  stage: InitiativeStage;
  status: InitiativeStatus;
  confidence: ConfidenceLevel;
  narrative_en: string | null;
  narrative_ar: string | null;
  submitted_by: string;
  created_at: Date;
}

function initiativeView(row: InitiativeRow): InitiativeView {
  return {
    id: row.id,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    strategicPlayNodeId: row.strategic_play_node_id,
    ownerUserId: row.owner_user_id,
    stage: row.stage,
    priority: row.priority,
    department: row.department,
    startDate: row.start_date,
    endDate: row.end_date,
    tags: row.tags,
    createdAt: row.created_at,
  };
}

function projectView(row: ProjectRow): ProjectView {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    department: row.department,
    ownerUserId: row.owner_user_id,
    parentInitiativeId: row.parent_initiative_id,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetAmount: row.budget_amount,
    priority: row.priority,
    jiraBoardUrl: row.jira_board_url,
    confluenceSpaceUrl: row.confluence_space_url,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function statusView(row: StatusRow): StatusUpdateView {
  return {
    id: row.id,
    initiativeId: row.initiative_id,
    period: row.period,
    stage: row.stage,
    status: row.status,
    confidence: row.confidence,
    narrativeEn: row.narrative_en,
    narrativeAr: row.narrative_ar,
    submittedBy: row.submitted_by,
    createdAt: row.created_at,
  };
}

export class ExecutionService {
  constructor(private readonly prisma: PrismaService) {}

  async registerInitiative(input: {
    nameEn: string;
    nameAr: string;
    strategicPlayNodeId: string;
    ownerUserId: string;
    stage: InitiativeStage;
    priority?: Priority;
    department?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    tags?: string[];
    budgetAmount?: number | null;
    currency?: string;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<InitiativeView> {
    const play = await this.prisma.strategyNode.findUnique({
      where: { id: input.strategicPlayNodeId },
      select: { id: true, type: true, state: true },
    });

    if (!play || play.type !== "STRATEGIC_PLAY" || play.state !== "ACTIVE") {
      throw executionErrors.invalidPlay();
    }

    if (!input.actorIsSeoAdministrator) {
      const ownership = await this.prisma.ownerAssignment.findUnique({
        where: {
          nodeId_ownerUserId: {
            nodeId: input.strategicPlayNodeId,
            ownerUserId: input.actorUserId,
          },
        },
        select: { id: true },
      });
      if (!ownership) throw executionErrors.playOwnershipRequired();
    }

    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw executionErrors.invalidDateRange();
    }

    const priority = input.priority ?? "medium";
    const tags = input.tags ?? [];

    const [row] = await this.prisma.$queryRaw<InitiativeRow[]>`
      INSERT INTO "execution"."initiatives"
        ("name_en", "name_ar", "strategic_play_node_id", "owner_user_id", "stage", "priority", "department", "start_date", "end_date", "tags")
      VALUES
        (${input.nameEn}, ${input.nameAr}, ${input.strategicPlayNodeId}::uuid, ${input.ownerUserId}, ${input.stage}::"execution"."InitiativeStage", ${priority}::"execution"."Priority", ${input.department ?? null}, ${input.startDate ?? null}, ${input.endDate ?? null}, ${tags})
      RETURNING id, name_en, name_ar, strategic_play_node_id, owner_user_id, stage, priority, department, start_date, end_date, tags, created_at
    `;
    if (!row) throw executionErrors.invalidOperation();

    if (input.budgetAmount != null) {
      await this.prisma.$executeRaw`
        INSERT INTO "execution"."financial_attrs"
          ("initiative_id", "budget_amount", "spend_amount", "currency", "source", "locked")
        VALUES
          (${row.id}::uuid, ${input.budgetAmount}, 0, ${input.currency ?? "USD"}, 'manual'::"execution"."ExecutionSource", false)
        ON CONFLICT ("initiative_id") DO UPDATE SET
          "budget_amount" = EXCLUDED."budget_amount",
          "currency" = EXCLUDED."currency",
          "updated_at" = CURRENT_TIMESTAMP
      `;
    }

    return initiativeView(row);
  }

  async createProject(input: {
    name: string;
    description?: string | null;
    department?: string | null;
    ownerUserId: string;
    parentInitiativeId?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    budgetAmount?: number | null;
    priority?: Priority;
    jiraBoardUrl?: string | null;
    confluenceSpaceUrl?: string | null;
    actorUserId: string;
  }): Promise<ProjectView> {
    if (input.startDate && input.endDate && input.endDate < input.startDate) {
      throw executionErrors.invalidDateRange();
    }

    if (input.parentInitiativeId) {
      await this.requireInitiative(input.parentInitiativeId);
    }

    const priority = input.priority ?? "medium";

    const [row] = await this.prisma.$queryRaw<ProjectRow[]>`
      INSERT INTO "execution"."projects"
        ("name", "description", "department", "owner_user_id", "parent_initiative_id", "start_date", "end_date", "budget_amount", "priority", "jira_board_url", "confluence_space_url", "created_by")
      VALUES
        (${input.name}, ${input.description ?? null}, ${input.department ?? null}, ${input.ownerUserId}, ${input.parentInitiativeId ?? null}::uuid, ${input.startDate ?? null}, ${input.endDate ?? null}, ${input.budgetAmount ?? null}, ${priority}::"execution"."Priority", ${input.jiraBoardUrl ?? null}, ${input.confluenceSpaceUrl ?? null}, ${input.actorUserId})
      RETURNING id, name, description, department, owner_user_id, parent_initiative_id, start_date, end_date, budget_amount::text, priority, jira_board_url, confluence_space_url, created_by, created_at, updated_at
    `;
    if (!row) throw executionErrors.invalidOperation();
    return projectView(row);
  }

  async listProjects(input: { parentInitiativeId?: string }): Promise<ProjectView[]> {
    const rows = input.parentInitiativeId
      ? await this.prisma.$queryRaw<ProjectRow[]>`
          SELECT id, name, description, department, owner_user_id, parent_initiative_id, start_date, end_date, budget_amount::text, priority, jira_board_url, confluence_space_url, created_by, created_at, updated_at
          FROM "execution"."projects"
          WHERE parent_initiative_id = ${input.parentInitiativeId}::uuid
          ORDER BY created_at DESC, id DESC
        `
      : await this.prisma.$queryRaw<ProjectRow[]>`
          SELECT id, name, description, department, owner_user_id, parent_initiative_id, start_date, end_date, budget_amount::text, priority, jira_board_url, confluence_space_url, created_by, created_at, updated_at
          FROM "execution"."projects"
          ORDER BY created_at DESC, id DESC
        `;
    return rows.map(projectView);
  }

  async list(input: {
    status?: InitiativeStatus;
    scope: "all" | "mine" | "my_plays";
    actorUserId: string;
  }): Promise<InitiativeListItemView[]> {
    const rows = await this.prisma.$queryRaw<InitiativeListRow[]>`
      SELECT
        i.id, i.name_en, i.name_ar, i.strategic_play_node_id, i.owner_user_id,
        u.display_name AS owner_display_name, i.stage, i.updated_at,
        s.status AS latest_status, s.confidence AS latest_confidence,
        (j.id IS NOT NULL) AS has_jira_link,
        (CASE WHEN j.id IS NULL THEN 0 ELSE 1 END)::int AS linked_project_count,
        EXISTS (
          SELECT 1 FROM "strategy"."owner_assignments" oa
          WHERE oa.node_id = i.strategic_play_node_id
            AND oa.owner_user_id = ${input.actorUserId}
        ) AS play_owned_by_actor
      FROM "execution"."initiatives" i
      LEFT JOIN "iam"."users" u ON u.id = i.owner_user_id
      LEFT JOIN LATERAL (
        SELECT status, confidence
        FROM "execution"."status_updates" su
        WHERE su.initiative_id = i.id
        ORDER BY su.period DESC, su.created_at DESC, su.id DESC
        LIMIT 1
      ) s ON true
      LEFT JOIN "execution"."jira_links" j ON j.initiative_id = i.id
      ORDER BY i.updated_at DESC, i.id DESC
    `;

    return rows
      .filter((row) => input.scope !== "mine" || row.owner_user_id === input.actorUserId)
      .filter((row) => input.scope !== "my_plays" || row.play_owned_by_actor)
      .filter((row) => !input.status || row.latest_status === input.status)
      .map((row) => ({
        id: row.id,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        strategicPlayNodeId: row.strategic_play_node_id,
        ownerUserId: row.owner_user_id,
        ownerDisplayName: row.owner_display_name,
        stage: row.stage,
        latestStatus: row.latest_status,
        latestConfidence: row.latest_confidence,
        hasJiraLink: row.has_jira_link,
        linkedProjectCount: row.linked_project_count,
        updatedAt: row.updated_at,
      }));
  }

  async getInitiative(initiativeId: string): Promise<InitiativeDetailView> {
    const [initiative] = await this.prisma.$queryRaw<InitiativeDetailRow[]>`
      SELECT
        i.id, i.name_en, i.name_ar, i.strategic_play_node_id, i.owner_user_id,
        i.stage, i.created_at, i.updated_at,
        u.display_name AS owner_display_name,
        sp.id AS play_id, sp.name_en AS play_name_en, sp.name_ar AS play_name_ar,
        sp.plan_version_id AS play_plan_version_id
      FROM "execution"."initiatives" i
      LEFT JOIN "iam"."users" u ON u.id = i.owner_user_id
      LEFT JOIN "strategy"."strategy_nodes" sp ON sp.id = i.strategic_play_node_id
      WHERE i.id = ${initiativeId}::uuid
    `;
    if (!initiative) throw executionErrors.initiativeNotFound();
    if (!initiative.play_id || !initiative.play_name_en || !initiative.play_name_ar || !initiative.play_plan_version_id) {
      throw executionErrors.invalidOperation("Initiative strategic play could not be resolved");
    }

    const [objectives, jiraLinks, latestStatuses] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; name_en: string; name_ar: string }>>`
        SELECT objective.id, objective.name_en, objective.name_ar
        FROM "strategy"."strategy_edges" edge
        JOIN "strategy"."strategy_nodes" objective ON objective.id = edge.from_node_id
        WHERE edge.to_node_id = ${initiative.strategic_play_node_id}::uuid
          AND edge.edge_type = 'executed_by'::"strategy"."StrategyEdgeType"
          AND edge.plan_version_id = ${initiative.play_plan_version_id}::uuid
          AND objective.plan_version_id = ${initiative.play_plan_version_id}::uuid
          AND objective.type = 'objective'::"strategy"."StrategyNodeType"
        ORDER BY objective.name_en ASC, objective.id ASC
      `,
      this.prisma.$queryRaw<Array<{
        id: string;
        jira_project_key: string;
        jira_project_url: string;
        last_synced_at: Date | null;
        created_at: Date;
        updated_at: Date;
      }>>`
        SELECT id, jira_project_key, jira_project_url, last_synced_at, created_at, updated_at
        FROM "execution"."jira_links"
        WHERE initiative_id = ${initiativeId}::uuid
      `,
      this.prisma.$queryRaw<StatusRow[]>`
        SELECT id, initiative_id, period, stage, status, confidence,
               narrative_en, narrative_ar, submitted_by, created_at
        FROM "execution"."status_updates"
        WHERE initiative_id = ${initiativeId}::uuid
        ORDER BY period DESC, created_at DESC, id DESC
        LIMIT 1
      `,
    ]);

    const jira = jiraLinks[0] ?? null;
    const milestones = jira
      ? await this.prisma.$queryRaw<Array<{
          id: string;
          name_en: string;
          name_ar: string;
          due_date: Date;
          forecast_date: Date | null;
          health: "on_time" | "at_risk" | "late";
          source: "manual" | "jira";
          created_at: Date;
        }>>`
          SELECT id, name_en, name_ar, due_date, forecast_date, health, source, created_at
          FROM "execution"."milestone_flags"
          WHERE jira_link_id = ${jira.id}::uuid
          ORDER BY due_date ASC, id ASC
        `
      : [];
    const latestStatus = latestStatuses[0] ? statusView(latestStatuses[0]) : null;

    return {
      id: initiative.id,
      nameEn: initiative.name_en,
      nameAr: initiative.name_ar,
      strategicPlayNodeId: initiative.strategic_play_node_id,
      ownerUserId: initiative.owner_user_id,
      stage: initiative.stage,
      createdAt: initiative.created_at,
      updatedAt: initiative.updated_at,
      owner: { id: initiative.owner_user_id, displayName: initiative.owner_display_name },
      strategicPlay: {
        id: initiative.play_id,
        nameEn: initiative.play_name_en,
        nameAr: initiative.play_name_ar,
        planVersionId: initiative.play_plan_version_id,
      },
      objectives: objectives.map((row) => ({ id: row.id, nameEn: row.name_en, nameAr: row.name_ar })),
      jiraLink: jira ? {
        id: jira.id,
        jiraProjectKey: jira.jira_project_key,
        jiraProjectUrl: jira.jira_project_url,
        lastSyncedAt: jira.last_synced_at,
        createdAt: jira.created_at,
        updatedAt: jira.updated_at,
      } : null,
      milestones: milestones.map((row) => ({
        id: row.id,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        dueDate: row.due_date,
        forecastDate: row.forecast_date,
        health: row.health,
        source: row.source,
        createdAt: row.created_at,
      })),
      latestStatus: latestStatus ? {
        id: latestStatus.id,
        period: latestStatus.period,
        stage: latestStatus.stage,
        status: latestStatus.status,
        confidence: latestStatus.confidence,
        narrativeEn: latestStatus.narrativeEn,
        narrativeAr: latestStatus.narrativeAr,
        submittedBy: latestStatus.submittedBy,
        createdAt: latestStatus.createdAt,
      } : null,
    };
  }

  async linkJira(input: {
    initiativeId: string;
    jiraProjectKey: string;
    jiraProjectUrl: string;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }) {
    await this.authorizeInitiativeWrite(
      input.initiativeId,
      input.actorUserId,
      input.actorIsSeoAdministrator,
    );
    const [row] = await this.prisma.$queryRaw<Array<{
      id: string;
      initiative_id: string;
      jira_project_key: string;
      jira_project_url: string;
      last_synced_at: Date | null;
    }>>`
      INSERT INTO "execution"."jira_links"
        ("initiative_id", "jira_project_key", "jira_project_url")
      VALUES
        (${input.initiativeId}::uuid, ${input.jiraProjectKey}, ${input.jiraProjectUrl})
      ON CONFLICT ("initiative_id") DO UPDATE SET
        "jira_project_key" = EXCLUDED."jira_project_key",
        "jira_project_url" = EXCLUDED."jira_project_url",
        "updated_at" = CURRENT_TIMESTAMP
      RETURNING id, initiative_id, jira_project_key, jira_project_url, last_synced_at
    `;
    if (!row) throw executionErrors.invalidOperation();
    return {
      id: row.id,
      initiativeId: row.initiative_id,
      jiraProjectKey: row.jira_project_key,
      jiraProjectUrl: row.jira_project_url,
      lastSyncedAt: row.last_synced_at,
    };
  }

  async flagMilestone(input: {
    jiraLinkId: string;
    nameEn: string;
    nameAr: string;
    dueDate: Date;
    forecastDate?: Date | null;
    health: "on_time" | "at_risk" | "late";
    source: "manual" | "jira";
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }) {
    const link = await this.prisma.jiraLink.findUnique({
      where: { id: input.jiraLinkId },
      select: { initiativeId: true },
    });
    if (!link) throw executionErrors.jiraLinkNotFound();
    await this.authorizeInitiativeWrite(
      link.initiativeId,
      input.actorUserId,
      input.actorIsSeoAdministrator,
    );

    const [row] = await this.prisma.$queryRaw<Array<{
      id: string;
      jira_link_id: string;
      name_en: string;
      name_ar: string;
      due_date: Date;
      forecast_date: Date | null;
      health: "on_time" | "at_risk" | "late";
      source: "manual" | "jira";
    }>>`
      INSERT INTO "execution"."milestone_flags"
        ("jira_link_id", "name_en", "name_ar", "due_date", "forecast_date", "health", "source")
      VALUES
        (${input.jiraLinkId}::uuid, ${input.nameEn}, ${input.nameAr}, ${input.dueDate}, ${input.forecastDate ?? null}, ${input.health}::"execution"."MilestoneHealth", ${input.source}::"execution"."ExecutionSource")
      RETURNING id, jira_link_id, name_en, name_ar, due_date, forecast_date, health, source
    `;
    if (!row) throw executionErrors.invalidOperation();
    return row;
  }

  async updateStatus(input: {
    initiativeId: string;
    period: string;
    stage: InitiativeStage;
    status: InitiativeStatus;
    confidence: ConfidenceLevel;
    narrativeEn?: string | null;
    narrativeAr?: string | null;
    actorUserId: string;
    actorIsSeoAdministrator: boolean;
  }): Promise<StatusUpdateView> {
    await this.authorizeInitiativeWrite(
      input.initiativeId,
      input.actorUserId,
      input.actorIsSeoAdministrator,
    );
    const [row] = await this.prisma.$queryRaw<StatusRow[]>`
      INSERT INTO "execution"."status_updates"
        ("initiative_id", "period", "stage", "status", "confidence", "narrative_en", "narrative_ar", "submitted_by")
      VALUES
        (${input.initiativeId}::uuid, ${input.period}, ${input.stage}::"execution"."InitiativeStage", ${input.status}::"execution"."InitiativeStatus", ${input.confidence}::"execution"."ConfidenceLevel", ${input.narrativeEn ?? null}, ${input.narrativeAr ?? null}, ${input.actorUserId})
      RETURNING id, initiative_id, period, stage, status, confidence, narrative_en, narrative_ar, submitted_by, created_at
    `;
    if (!row) throw executionErrors.invalidOperation();
    return statusView(row);
  }

  async statusHistory(initiativeId: string): Promise<StatusUpdateView[]> {
    await this.requireInitiative(initiativeId);
    const rows = await this.prisma.$queryRaw<StatusRow[]>`
      SELECT id, initiative_id, period, stage, status, confidence, narrative_en, narrative_ar, submitted_by, created_at
      FROM "execution"."status_updates"
      WHERE initiative_id = ${initiativeId}::uuid
      ORDER BY period DESC, created_at DESC, id DESC
    `;
    return rows.map(statusView);
  }

  async setFinancialAttr(input: {
    initiativeId: string;
    budgetAmount: number;
    spendAmount: number;
    currency: string;
    source: ExecutionSource;
    locked: boolean;
  }) {
    await this.requireInitiative(input.initiativeId);
    const current = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT locked FROM "execution"."financial_attrs" WHERE initiative_id = ${input.initiativeId}::uuid
    `;
    if (current[0]?.locked && input.source === "manual") throw executionErrors.feedLocked();

    await this.prisma.$executeRaw`
      INSERT INTO "execution"."financial_attrs"
        ("initiative_id", "budget_amount", "spend_amount", "currency", "source", "locked")
      VALUES
        (${input.initiativeId}::uuid, ${input.budgetAmount}, ${input.spendAmount}, ${input.currency}, ${input.source}::"execution"."ExecutionSource", ${input.locked})
      ON CONFLICT ("initiative_id") DO UPDATE SET
        "budget_amount" = EXCLUDED."budget_amount",
        "spend_amount" = EXCLUDED."spend_amount",
        "currency" = EXCLUDED."currency",
        "source" = EXCLUDED."source",
        "locked" = EXCLUDED."locked",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }

  async setRiskIndicator(input: {
    initiativeId: string;
    level: RiskLevel;
    source: ExecutionSource;
    locked: boolean;
  }) {
    await this.requireInitiative(input.initiativeId);
    const current = await this.prisma.$queryRaw<Array<{ locked: boolean }>>`
      SELECT locked FROM "execution"."risk_indicators" WHERE initiative_id = ${input.initiativeId}::uuid
    `;
    if (current[0]?.locked && input.source === "manual") throw executionErrors.feedLocked();

    await this.prisma.$executeRaw`
      INSERT INTO "execution"."risk_indicators"
        ("initiative_id", "level", "source", "locked")
      VALUES
        (${input.initiativeId}::uuid, ${input.level}::"execution"."RiskLevel", ${input.source}::"execution"."ExecutionSource", ${input.locked})
      ON CONFLICT ("initiative_id") DO UPDATE SET
        "level" = EXCLUDED."level",
        "source" = EXCLUDED."source",
        "locked" = EXCLUDED."locked",
        "updated_at" = CURRENT_TIMESTAMP
    `;
  }

  private async requireInitiative(initiativeId: string): Promise<void> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "execution"."initiatives" WHERE id = ${initiativeId}::uuid
    `;
    if (!rows[0]) throw executionErrors.initiativeNotFound();
  }

  private async authorizeInitiativeWrite(
    initiativeId: string,
    actorUserId: string,
    actorIsSeoAdministrator: boolean,
  ): Promise<void> {
    if (actorIsSeoAdministrator) {
      await this.requireInitiative(initiativeId);
      return;
    }

    const initiative = await this.prisma.initiative.findUnique({
      where: { id: initiativeId },
      select: { ownerUserId: true, strategicPlayNodeId: true },
    });
    if (!initiative) throw executionErrors.initiativeNotFound();
    if (initiative.ownerUserId === actorUserId) return;

    const playOwnership = await this.prisma.ownerAssignment.findUnique({
      where: {
        nodeId_ownerUserId: {
          nodeId: initiative.strategicPlayNodeId,
          ownerUserId: actorUserId,
        },
      },
      select: { id: true },
    });
    if (!playOwnership) throw executionErrors.initiativeOwnershipRequired();
  }
}
