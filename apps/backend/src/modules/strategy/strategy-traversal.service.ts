import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { StrategyEdgeType, StrategyNodeState, StrategyNodeType } from "../../generated/prisma/enums";

export const MAX_STRATEGY_TRAVERSAL_DEPTH = 8;

export interface StrategyTraversalNode {
  id: string;
  type: StrategyNodeType;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
  state: StrategyNodeState;
  depth: number;
  edgeType: StrategyEdgeType | null;
}

export interface StrategyFullTrace {
  nodeId: string;
  ancestry: StrategyTraversalNode[];
  cascade: StrategyTraversalNode[];
}

interface TraversalRow {
  id: string;
  type: StrategyNodeType;
  name_en: string;
  name_ar: string;
  plan_version_id: string;
  state: StrategyNodeState;
  depth: number;
  edge_type: StrategyEdgeType | null;
}

interface StrategyDatabase {
  // Recursive statements use Kysely's typed `sql` escape hatch because CTE row
  // types are dynamic. Domain enum types still come from the Prisma generator,
  // so Prisma and Kysely share one source of database truth per TSD-09.
  __strategy_type_anchor: {
    node_type: StrategyNodeType;
    node_state: StrategyNodeState;
    edge_type: StrategyEdgeType;
  };
}

/** Kysely-backed recursive CTE traversal, bounded to ADR-03's depth of eight. */
export class StrategyTraversalService {
  private readonly db: Kysely<StrategyDatabase>;

  constructor(connectionString: string) {
    this.db = new Kysely<StrategyDatabase>({
      dialect: new PostgresDialect({
        pool: new Pool({ connectionString, max: 4 }),
      }),
    });
  }

  async getCascade(nodeId: string, maxDepth = MAX_STRATEGY_TRAVERSAL_DEPTH): Promise<StrategyTraversalNode[]> {
    this.assertDepth(maxDepth);
    const result = await sql<TraversalRow>`
      WITH RECURSIVE descendants AS (
        SELECT
          e.to_node_id AS id,
          e.plan_version_id,
          e.edge_type,
          1::integer AS depth
        FROM strategy.strategy_edges e
        WHERE e.from_node_id = ${nodeId}::uuid

        UNION ALL

        SELECT
          e.to_node_id AS id,
          e.plan_version_id,
          e.edge_type,
          d.depth + 1
        FROM descendants d
        JOIN strategy.strategy_edges e
          ON e.from_node_id = d.id
         AND e.plan_version_id = d.plan_version_id
        WHERE d.depth < ${maxDepth}::integer
      )
      SELECT
        n.id, n.type, n.name_en, n.name_ar, n.plan_version_id, n.state,
        d.depth, d.edge_type
      FROM descendants d
      JOIN strategy.strategy_nodes n
        ON n.id = d.id
       AND n.plan_version_id = d.plan_version_id
      WHERE n.state <> 'retired'
      ORDER BY d.depth, n.id
    `.execute(this.db);
    return result.rows.map(this.mapRow);
  }

  async getAncestry(nodeId: string): Promise<StrategyTraversalNode[]> {
    const result = await sql<TraversalRow>`
      WITH RECURSIVE ancestors AS (
        SELECT
          e.from_node_id AS id,
          e.plan_version_id,
          e.edge_type,
          1::integer AS depth
        FROM strategy.strategy_edges e
        WHERE e.to_node_id = ${nodeId}::uuid

        UNION ALL

        SELECT
          e.from_node_id AS id,
          e.plan_version_id,
          e.edge_type,
          a.depth + 1
        FROM ancestors a
        JOIN strategy.strategy_edges e
          ON e.to_node_id = a.id
         AND e.plan_version_id = a.plan_version_id
        WHERE a.depth < ${MAX_STRATEGY_TRAVERSAL_DEPTH}::integer
      )
      SELECT
        n.id, n.type, n.name_en, n.name_ar, n.plan_version_id, n.state,
        a.depth, a.edge_type
      FROM ancestors a
      JOIN strategy.strategy_nodes n
        ON n.id = a.id
       AND n.plan_version_id = a.plan_version_id
      WHERE n.state <> 'retired'
      ORDER BY a.depth DESC, n.id
    `.execute(this.db);
    return result.rows.map(this.mapRow);
  }

  async getFullTrace(nodeId: string): Promise<StrategyFullTrace> {
    const [ancestry, cascade] = await Promise.all([
      this.getAncestry(nodeId),
      this.getCascade(nodeId),
    ]);
    return { nodeId, ancestry, cascade };
  }

  async refreshTraceability(): Promise<void> {
    await sql`REFRESH MATERIALIZED VIEW CONCURRENTLY strategy.traceability_edges`.execute(this.db);
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }

  private assertDepth(maxDepth: number): void {
    if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > MAX_STRATEGY_TRAVERSAL_DEPTH) {
      throw new Error(`maxDepth must be an integer between 1 and ${MAX_STRATEGY_TRAVERSAL_DEPTH}`);
    }
  }

  private readonly mapRow = (row: TraversalRow): StrategyTraversalNode => ({
    id: row.id,
    type: row.type,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    planVersionId: row.plan_version_id,
    state: row.state,
    depth: row.depth,
    edgeType: row.edge_type,
  });
}
