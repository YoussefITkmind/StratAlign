import type { PrismaService } from "../../database/prisma.service";
import type { RulesService } from "../rules/rules.service";
import { portfolioErrors } from "./portfolio.errors";

export interface UnmappedPlayView {
  id: string;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
}

export interface PortfolioRagView {
  areaOfFocusId: string;
  period: string;
  status: "on_track" | "watch" | "off_track";
  score: number;
  initiativeCount: number;
  ruleId: string;
}

interface PlayRow {
  id: string;
  name_en: string;
  name_ar: string;
  plan_version_id: string;
}

interface StatusRow {
  initiative_id: string;
  status: "on_track" | "at_risk" | "off_track";
}

export class PortfolioService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: RulesService,
  ) {}

  async findUnmappedPlays(): Promise<UnmappedPlayView[]> {
    const rows = await this.prisma.$queryRaw<PlayRow[]>`
      SELECT p.id, p.name_en, p.name_ar, p.plan_version_id
      FROM strategy.strategy_nodes p
      WHERE p.type = 'strategic_play'
        AND p.state = 'active'
        AND NOT EXISTS (
          SELECT 1
          FROM strategy.strategy_edges e
          JOIN strategy.strategy_nodes aof ON aof.id = e.to_node_id
          WHERE e.from_node_id = p.id
            AND e.edge_type = 'belongs_to_portfolio'
            AND e.plan_version_id = p.plan_version_id
            AND aof.type = 'area_of_focus'
            AND aof.state = 'active'
        )
      ORDER BY p.name_en, p.id
    `;

    return rows.map((row) => ({
      id: row.id,
      nameEn: row.name_en,
      nameAr: row.name_ar,
      planVersionId: row.plan_version_id,
    }));
  }

  async computeRag(areaOfFocusId: string, period: string): Promise<PortfolioRagView> {
    const [aof] = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM strategy.strategy_nodes
      WHERE id = ${areaOfFocusId}::uuid
        AND type = 'area_of_focus'
        AND state = 'active'
    `;
    if (!aof) throw portfolioErrors.areaOfFocusNotFound();

    const statuses = await this.prisma.$queryRaw<StatusRow[]>`
      SELECT DISTINCT ON (su.initiative_id)
        su.initiative_id,
        su.status::text AS status
      FROM execution.status_updates su
      JOIN execution.initiatives i ON i.id = su.initiative_id
      JOIN strategy.strategy_edges e
        ON e.from_node_id = i.strategic_play_node_id
       AND e.to_node_id = ${areaOfFocusId}::uuid
       AND e.edge_type = 'belongs_to_portfolio'
      WHERE su.period = ${period}
      ORDER BY su.initiative_id, su.created_at DESC, su.id DESC
    `;

    if (statuses.length === 0) throw portfolioErrors.noInitiativeStatuses();

    const rule = await this.rules.getPublished("portfolio-rag");
    if (!rule || rule.ruleType !== "rag_aggregation") {
      throw portfolioErrors.ragRuleNotFound();
    }

    const result = await this.rules.evaluate(rule.id, {
      children: statuses.map((row) => ({
        id: row.initiative_id,
        status: row.status === "at_risk" ? "watch" : row.status,
      })),
    });

    if (
      !("status" in result) ||
      !("score" in result) ||
      typeof result.score !== "number" ||
      (result.status !== "on_track" && result.status !== "watch" && result.status !== "off_track")
    ) {
      throw portfolioErrors.ragRuleNotFound();
    }

    return {
      areaOfFocusId,
      period,
      status: result.status,
      score: result.score,
      initiativeCount: statuses.length,
      ruleId: rule.id,
    };
  }
}
