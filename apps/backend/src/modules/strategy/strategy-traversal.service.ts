import type { StrategyEdgeType, StrategyNodeState, StrategyNodeType } from "../../generated/prisma/enums";
import type { PrismaService } from "../../database/prisma.service";

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

/**
 * Recursive CTE read service for Prompt 2.2.
 *
 * TSD-09 asks traversal code to share Prisma-generated database types rather
 * than maintaining a second generated schema. The row contracts above use the
 * Prisma-generated strategy enums, while the recursive SQL is kept as a
 * parameterized CTE because Prisma itself does not expose recursive traversal.
 * The query shape is intentionally compatible with Kysely's sql/CTE model so
 * it can be moved behind the shared Kysely adapter without changing callers.
 */
export class StrategyTraversalService {
  constructor(private readonly prisma: PrismaService) {}

  async getCascade(nodeId: string, maxDepth = MAX_STRATEGY_TRAVERSAL_DEPTH): Promise<StrategyTraversalNode[]> {
    this.assertDepth(maxDepth);
    const rows = await this.prisma.$queryRawUnsafe<TraversalRow[]>(`
      WITH RECURSIVE descendants AS (
        SELECT
          n.id, n.type, n.name_en, n.name_ar, n.plan_version_id, n.state,
          0::integer AS depth,
          NULL::strategy."StrategyEdgeType" AS edge_type,
          ARRAY[n.id]::uuid[] AS path
        FROM strategy.strategy_nodes n
        WHERE n.id = $1::uuid

        UNION ALL

        SELECT
          child.id, child.type, child.name_en, child.name_ar,
          child.plan_version_id, child.state,
          d.depth + 1,
          e.edge_type,
          d.path || child.id
        FROM descendants d
        JOIN strategy.strategy_edges e
          ON e.from_node_id = d.id
         AND e.plan_version_id = d.plan_version_id
        JOIN strategy.strategy_nodes child
          ON child.id = e.to_node_id
         AND child.plan_version_id = d.plan_version_id
        WHERE d.depth < $2::integer
          AND child.state <> 'retired'
          AND NOT child.id = ANY(d.path)
      )
      SELECT id, type, name_en, name_ar, plan_version_id, state, depth, edge_type
      FROM descendants
      WHERE depth > 0
      ORDER BY depth, id
    `, nodeId, maxDepth);
    return rows.map(this.mapRow);
  }

  async getAncestry(nodeId: string): Promise<StrategyTraversalNode[]> {
    const rows = await this.prisma.$queryRawUnsafe<TraversalRow[]>(`
      WITH RECURSIVE ancestors AS (
        SELECT
          n.id, n.type, n.name_en, n.name_ar, n.plan_version_id, n.state,
          0::integer AS depth,
          NULL::strategy."StrategyEdgeType" AS edge_type,
          ARRAY[n.id]::uuid[] AS path
        FROM strategy.strategy_nodes n
        WHERE n.id = $1::uuid

        UNION ALL

        SELECT
          parent.id, parent.type, parent.name_en, parent.name_ar,
          parent.plan_version_id, parent.state,
          a.depth + 1,
          e.edge_type,
          a.path || parent.id
        FROM ancestors a
        JOIN strategy.strategy_edges e
          ON e.to_node_id = a.id
         AND e.plan_version_id = a.plan_version_id
        JOIN strategy.strategy_nodes parent
          ON parent.id = e.from_node_id
         AND parent.plan_version_id = a.plan_version_id
        WHERE a.depth < 8
          AND parent.state <> 'retired'
          AND NOT parent.id = ANY(a.path)
      )
      SELECT id, type, name_en, name_ar, plan_version_id, state, depth, edge_type
      FROM ancestors
      WHERE depth > 0
      ORDER BY depth DESC, id
    `, nodeId);
    return rows.map(this.mapRow);
  }

  async getFullTrace(nodeId: string): Promise<StrategyFullTrace> {
    const [ancestry, cascade] = await Promise.all([
      this.getAncestry(nodeId),
      this.getCascade(nodeId),
    ]);
    return { nodeId, ancestry, cascade };
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
