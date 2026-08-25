import type { PrismaService } from "../../database/prisma.service";

export type CurrentMapLinkType = "weak" | "strong" | "enables" | "impacts" | "drives" | "supports";

export class ScorecardMapSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertLink(input: {
    scorecardId: string;
    fromObjectiveId: string;
    toObjectiveId: string;
    strength: CurrentMapLinkType;
  }) {
    if (input.fromObjectiveId === input.toObjectiveId) throw new Error("An objective cannot connect to itself");

    return this.prisma.$transaction(async (tx) => {
      const objectives = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT objective_node_id AS id
        FROM scorecard.objective_profiles
        WHERE scorecard_id = ${input.scorecardId}::uuid
          AND objective_node_id IN (${input.fromObjectiveId}::uuid, ${input.toObjectiveId}::uuid)`;
      if (objectives.length !== 2) throw new Error("Both objectives must belong to the selected scorecard");

      let maps = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM scorecard.strategy_maps
        WHERE scorecard_id = ${input.scorecardId}::uuid AND state = 'published'
        ORDER BY created_at DESC, id DESC LIMIT 1`;

      if (maps.length === 0) {
        maps = await tx.$queryRaw<Array<{ id: string }>>`
          INSERT INTO scorecard.strategy_maps (scorecard_id, state)
          VALUES (${input.scorecardId}::uuid, 'published'::scorecard.strategy_map_state)
          RETURNING id`;
      }
      const mapId = maps[0]!.id;

      const rows = await tx.$queryRaw<Array<{
        id: string;
        fromObjectiveId: string;
        toObjectiveId: string;
        strength: CurrentMapLinkType;
      }>>`
        INSERT INTO scorecard.map_links (strategy_map_id, from_objective_id, to_objective_id, strength)
        VALUES (${mapId}::uuid, ${input.fromObjectiveId}::uuid, ${input.toObjectiveId}::uuid, ${input.strength}::scorecard.map_link_strength)
        ON CONFLICT (strategy_map_id, from_objective_id, to_objective_id)
        DO UPDATE SET strength = EXCLUDED.strength
        RETURNING id,
          from_objective_id AS "fromObjectiveId",
          to_objective_id AS "toObjectiveId",
          strength`;
      return rows[0]!;
    });
  }

  async deleteLink(input: { scorecardId: string; linkId: string }) {
    const result = await this.prisma.$executeRaw`
      DELETE FROM scorecard.map_links ml
      USING scorecard.strategy_maps sm
      WHERE ml.strategy_map_id = sm.id
        AND sm.scorecard_id = ${input.scorecardId}::uuid
        AND sm.state = 'published'
        AND ml.id = ${input.linkId}::uuid`;
    if (result !== 1) throw new Error("Strategy Map connection not found");
    return { removed: true as const };
  }
}
