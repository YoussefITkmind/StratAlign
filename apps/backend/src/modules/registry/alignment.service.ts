import type { PrismaService } from "../../database/prisma.service";

import type { StrategyNodeGateway } from "./gateways/strategy-node.gateway";
import { RegistryOperationError } from "./registry.errors";
import {
  fromAlignmentTypeView,
  toAlignmentTypeView,
} from "./registry.mappers";
import type { AlignmentTypeView, AlignmentView } from "./registry.types";

export interface SetAlignmentsInput {
  kpiDefinitionId: string;
  alignments: AlignmentEntryInput[];
}

export interface AlignmentEntryInput {
  strategyNodeId: string;
  alignmentType: AlignmentTypeView;
}

/**
 * Many-to-many alignment between KPIs and strategy nodes.
 *
 * `strategy_node_id` carries no foreign key: strategy nodes belong to the
 * Strategy module (Prompts 2.1-2.3), which is not part of this repository.
 * The column is indexed so impact queries stay cheap, and ids are checked
 * through `StrategyNodeGateway` so referential validation becomes real the
 * moment an adapter exists — with no change to this service.
 */
export class AlignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategyNodes: StrategyNodeGateway,
  ) {}

  /**
   * Replaces a KPI's alignment set with exactly the entries supplied.
   *
   * Declarative rather than incremental: the caller states the desired set
   * and the service reconciles, so a repeated call is idempotent. Passing an
   * empty list clears every alignment.
   */
  async set(input: SetAlignmentsInput): Promise<AlignmentView[]> {
    const entries = input.alignments.map((entry) => ({
      strategyNodeId: entry.strategyNodeId.trim(),
      alignmentType: entry.alignmentType,
    }));

    if (entries.some((entry) => !entry.strategyNodeId)) {
      throw new RegistryOperationError(
        "Every alignment requires a strategy node id",
      );
    }

    const seen = new Set<string>();

    for (const entry of entries) {
      const key = `${entry.strategyNodeId}:${entry.alignmentType}`;

      if (seen.has(key)) {
        throw new RegistryOperationError(
          "Duplicate alignment entries were supplied",
        );
      }

      seen.add(key);
    }

    await this.strategyNodes.assertNodesExist(
      entries.map((entry) => entry.strategyNodeId),
    );

    try {
      // Delete-then-insert inside one transaction: an observer never sees a
      // KPI with a partially applied alignment set.
      return await this.prisma.$transaction(async (tx) => {
        const definition = await tx.kpiDefinition.findUnique({
          where: { id: input.kpiDefinitionId },
          select: { id: true, status: true },
        });

        if (!definition) {
          throw new RegistryOperationError("KPI was not found");
        }

        if (definition.status === "RETIRED") {
          throw new RegistryOperationError(
            "A retired KPI cannot be realigned",
          );
        }

        await tx.alignment.deleteMany({
          where: { kpiDefinitionId: definition.id },
        });

        if (entries.length > 0) {
          await tx.alignment.createMany({
            data: entries.map((entry) => ({
              kpiDefinitionId: definition.id,
              strategyNodeId: entry.strategyNodeId,
              alignmentType: fromAlignmentTypeView(entry.alignmentType),
            })),
          });
        }

        const persisted = await tx.alignment.findMany({
          where: { kpiDefinitionId: definition.id },
          orderBy: { createdAt: "asc" },
        });

        return persisted.map((alignment) => this.toView(alignment));
      });
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  async listForKpi(kpiDefinitionId: string): Promise<AlignmentView[]> {
    const alignments = await this.prisma.alignment.findMany({
      where: { kpiDefinitionId },
      orderBy: { createdAt: "asc" },
    });

    return alignments.map((alignment) => this.toView(alignment));
  }

  /** Every KPI aligned to a strategy node. Backed by the node id index. */
  async listForStrategyNode(
    strategyNodeId: string,
  ): Promise<AlignmentView[]> {
    const alignments = await this.prisma.alignment.findMany({
      where: { strategyNodeId },
      orderBy: { createdAt: "asc" },
    });

    return alignments.map((alignment) => this.toView(alignment));
  }

  private toView(alignment: {
    id: string;
    kpiDefinitionId: string;
    strategyNodeId: string;
    alignmentType: "OBJECTIVE" | "PLAY" | "SECTOR" | "PROJECT" | "THEME";
    createdAt: Date;
  }): AlignmentView {
    return {
      id: alignment.id,
      kpiDefinitionId: alignment.kpiDefinitionId,
      strategyNodeId: alignment.strategyNodeId,
      alignmentType: toAlignmentTypeView(alignment.alignmentType),
      createdAt: alignment.createdAt,
    };
  }

  private rethrow(error: unknown): Error {
    return error instanceof RegistryOperationError
      ? error
      : new RegistryOperationError();
  }
}
