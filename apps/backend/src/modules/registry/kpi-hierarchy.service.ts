import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";

import { RegistryOperationError } from "./registry.errors";
import type { KpiHierarchyEdgeView } from "./registry.types";

export interface SetRollupInput {
  parentKpiId: string;
  childKpiId: string;
  /** Must be a PUBLISHED RuleDefinition whose ruleType is ROLLUP. */
  rollupMethodRuleId: string;
}

/**
 * Parent/child KPI edges and the rollup rule that derives each parent.
 *
 * `rollupMethodRuleId` is the one cross-module reference in this module that
 * does have a foreign key, because `rules.rule_definitions` genuinely exists.
 * A foreign key cannot express *which kind* of rule is acceptable, so the
 * rule type check lives here.
 */
export class KpiHierarchyService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates or re-points the edge between a parent and a child KPI.
   *
   * Rejects, in order: self-reference, unknown KPIs, retired KPIs, a rule that
   * is not a published rollup rule, and any edge that would close a cycle.
   */
  async setRollup(input: SetRollupInput): Promise<KpiHierarchyEdgeView> {
    if (input.parentKpiId === input.childKpiId) {
      throw new RegistryOperationError(
        "A KPI cannot roll up into itself",
      );
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertKpisAreLinkable(tx, [
          input.parentKpiId,
          input.childKpiId,
        ]);

        await this.assertRuleIsPublishedRollup(tx, input.rollupMethodRuleId);
        await this.assertNoCycle(tx, input.parentKpiId, input.childKpiId);

        const edge = await tx.kpiHierarchyNode.upsert({
          where: {
            parentKpiId_childKpiId: {
              parentKpiId: input.parentKpiId,
              childKpiId: input.childKpiId,
            },
          },
          create: {
            parentKpiId: input.parentKpiId,
            childKpiId: input.childKpiId,
            rollupMethodRuleId: input.rollupMethodRuleId,
          },
          update: {
            rollupMethodRuleId: input.rollupMethodRuleId,
          },
        });

        return this.toView(edge);
      });
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  async listChildren(parentKpiId: string): Promise<KpiHierarchyEdgeView[]> {
    const edges = await this.prisma.kpiHierarchyNode.findMany({
      where: { parentKpiId },
      orderBy: { createdAt: "asc" },
    });

    return edges.map((edge) => this.toView(edge));
  }

  async removeRollup(
    parentKpiId: string,
    childKpiId: string,
  ): Promise<void> {
    const deleted = await this.prisma.kpiHierarchyNode.deleteMany({
      where: { parentKpiId, childKpiId },
    });

    if (deleted.count === 0) {
      throw new RegistryOperationError("Hierarchy edge was not found");
    }
  }

  private async assertKpisAreLinkable(
    tx: Prisma.TransactionClient,
    kpiIds: readonly string[],
  ): Promise<void> {
    const definitions = await tx.kpiDefinition.findMany({
      where: { id: { in: [...kpiIds] } },
      select: { id: true, status: true },
    });

    if (definitions.length !== new Set(kpiIds).size) {
      throw new RegistryOperationError(
        "Both KPIs must exist to form a hierarchy edge",
      );
    }

    if (definitions.some((definition) => definition.status === "RETIRED")) {
      throw new RegistryOperationError(
        "A retired KPI cannot participate in a hierarchy",
      );
    }
  }

  /**
   * The rule must be a rollup rule, and published.
   *
   * The type check is the requirement. Publication is required too because
   * `RulesService.evaluate` refuses anything that is not PUBLISHED, so an
   * edge pointing at a draft rule would be a rollup that can never run.
   */
  private async assertRuleIsPublishedRollup(
    tx: Prisma.TransactionClient,
    ruleId: string,
  ): Promise<void> {
    const rule = await tx.ruleDefinition.findUnique({
      where: { id: ruleId },
      select: { id: true, ruleType: true, status: true },
    });

    if (!rule) {
      throw new RegistryOperationError("Rollup rule was not found");
    }

    if (rule.ruleType !== "ROLLUP") {
      throw new RegistryOperationError(
        "The rollup method must reference a rule of type rollup",
      );
    }

    if (rule.status !== "PUBLISHED") {
      throw new RegistryOperationError(
        "The rollup method must reference a published rule",
      );
    }
  }

  /**
   * Rejects an edge that would close a cycle.
   *
   * Walks the child's descendants in the database rather than loading the
   * graph into memory: a recursive CTE terminates as soon as the parent is
   * reached, and stays correct however deep the hierarchy grows. The trivial
   * one-node cycle is caught earlier, and by the CHECK constraint.
   */
  private async assertNoCycle(
    tx: Prisma.TransactionClient,
    parentKpiId: string,
    childKpiId: string,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ cycle: boolean }>>`
      WITH RECURSIVE descendants AS (
        SELECT "child_kpi_id" AS id
        FROM "registry"."kpi_hierarchy_nodes"
        WHERE "parent_kpi_id" = ${childKpiId}

        UNION

        SELECT h."child_kpi_id"
        FROM "registry"."kpi_hierarchy_nodes" h
        JOIN descendants d ON h."parent_kpi_id" = d.id
      )
      SELECT EXISTS (
        SELECT 1 FROM descendants WHERE id = ${parentKpiId}
      ) AS cycle
    `;

    if (rows[0]?.cycle) {
      throw new RegistryOperationError(
        "This edge would create a cycle in the KPI hierarchy",
      );
    }
  }

  private toView(edge: {
    id: string;
    parentKpiId: string;
    childKpiId: string;
    rollupMethodRuleId: string;
    createdAt: Date;
  }): KpiHierarchyEdgeView {
    return {
      id: edge.id,
      parentKpiId: edge.parentKpiId,
      childKpiId: edge.childKpiId,
      rollupMethodRuleId: edge.rollupMethodRuleId,
      createdAt: edge.createdAt,
    };
  }

  private rethrow(error: unknown): Error {
    return error instanceof RegistryOperationError
      ? error
      : new RegistryOperationError();
  }
}
