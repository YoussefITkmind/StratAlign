import type { PrismaService } from "../../database/prisma.service";
import { executionErrors } from "./execution.errors";

export type InitiativeStage = "design" | "pilot" | "execute" | "scale" | "done";
export type InitiativeStatus = "on_track" | "at_risk" | "off_track";
export type ConfidenceLevel = "high" | "medium" | "low";
export type ExecutionSource = "manual" | "erp" | "jira";
export type RiskLevel = "low" | "medium" | "high";

export interface InitiativeView {
  id: string;
  nameEn: string;
  nameAr: string;
  strategicPlayNodeId: string;
  ownerUserId: string;
  stage: InitiativeStage;
  createdAt: Date;
}

export interface InitiativeListItemView {
  id: string;
  nameEn: string;
  nameAr: string;
  strategicPlayNodeId: string;
  ownerUserId: string;
  stage: InitiativeStage;
  latestStatus: InitiativeStatus | null;
  latestConfidence: ConfidenceLevel | null;
  hasJiraLink: boolean;
  updatedAt: Date;
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
  created_at: Date;
}

interface InitiativeListRow {
  id: string;
  name_en: string;
  name_ar: string;
  strategic_play_node_id: string;
  owner_user_id: string;
  stage: InitiativeStage;
  updated_at: Date;
  latest_status: InitiativeStatus | null;
  latest_confidence: ConfidenceLevel | null;
  has_jira_link: boolean;
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
    createdAt: row.created_at,
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

    const [row] = await this.prisma.$queryRaw<InitiativeRow[]>`
      INSERT INTO "execution"."initiatives"
        ("name_en", "name_ar", "strategic_play_node_id", "owner_user_id", "stage")
      VALUES
        (${input.nameEn}, ${input.nameAr}, ${input.strategicPlayNodeId}::uuid, ${input.ownerUserId}, ${input.stage}::"execution"."InitiativeStage")
      RETURNING id, name_en, name_ar, strategic_play_node_id, owner_user_id, stage, created_at
    `;
    if (!row) throw executionErrors.invalidOperation();
    return initiativeView(row);
  }

  async list(input: {
    status?: InitiativeStatus;
    scope: "all" | "mine";
    actorUserId: string;
  }): Promise<InitiativeListItemView[]> {
    const rows = await this.prisma.$queryRaw<InitiativeListRow[]>`
      SELECT
        i.id, i.name_en, i.name_ar, i.strategic_play_node_id, i.owner_user_id, i.stage, i.updated_at,
        s.status AS latest_status, s.confidence AS latest_confidence,
        (j.id IS NOT NULL) AS has_jira_link
      FROM "execution"."initiatives" i
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
      .filter((row) => !input.status || row.latest_status === input.status)
      .map((row) => ({
        id: row.id,
        nameEn: row.name_en,
        nameAr: row.name_ar,
        strategicPlayNodeId: row.strategic_play_node_id,
        ownerUserId: row.owner_user_id,
        stage: row.stage,
        latestStatus: row.latest_status,
        latestConfidence: row.latest_confidence,
        hasJiraLink: row.has_jira_link,
        updatedAt: row.updated_at,
      }));
  }

  async linkJira(input: {
    initiativeId: string;
    jiraProjectKey: string;
    jiraProjectUrl: string;
  }) {
    await this.requireInitiative(input.initiativeId);
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
  }) {
    const link = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "execution"."jira_links" WHERE id = ${input.jiraLinkId}::uuid
    `;
    if (!link[0]) throw executionErrors.jiraLinkNotFound();

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
    submittedBy: string;
  }): Promise<StatusUpdateView> {
    await this.requireInitiative(input.initiativeId);
    const [row] = await this.prisma.$queryRaw<StatusRow[]>`
      INSERT INTO "execution"."status_updates"
        ("initiative_id", "period", "stage", "status", "confidence", "narrative_en", "narrative_ar", "submitted_by")
      VALUES
        (${input.initiativeId}::uuid, ${input.period}, ${input.stage}::"execution"."InitiativeStage", ${input.status}::"execution"."InitiativeStatus", ${input.confidence}::"execution"."ConfidenceLevel", ${input.narrativeEn ?? null}, ${input.narrativeAr ?? null}, ${input.submittedBy})
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
}
