import type { PrismaService } from "../../../database/prisma.service";
import { RegistryOperationError } from "../registry.errors";

export interface StrategyNodeGateway {
  assertNodesExist(strategyNodeIds: readonly string[]): Promise<void>;
  assertObjectiveExists(strategyNodeId: string): Promise<void>;
  readonly canVerify: boolean;
}

/**
 * Production adapter backed by the live Strategy module.
 */
export class PrismaStrategyNodeGateway implements StrategyNodeGateway {
  readonly canVerify = true;

  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async assertObjectiveExists(
    strategyNodeId: string,
  ): Promise<void> {
    try {
      const node = await this.prisma.strategyNode.findUnique({
        where: {
          id: strategyNodeId,
        },
        select: {
          id: true,
          type: true,
        },
      });

      if (!node || node.type !== "OBJECTIVE") {
        throw new RegistryOperationError(
          "The OKR must reference an objective strategy node",
        );
      }
    } catch (error) {
      if (error instanceof RegistryOperationError) {
        throw error;
      }

      throw new RegistryOperationError(
        "The OKR must reference an objective strategy node",
      );
    }
  }

  async assertNodesExist(
    strategyNodeIds: readonly string[],
  ): Promise<void> {
    const ids = [...new Set(strategyNodeIds)];

    if (ids.length === 0) {
      return;
    }

    try {
      const nodes = await this.prisma.strategyNode.findMany({
        where: {
          id: {
            in: ids,
          },
        },
        select: {
          id: true,
        },
      });

      const found = new Set(nodes.map((node) => node.id));

      if (ids.some((id) => !found.has(id))) {
        throw new RegistryOperationError(
          "One or more strategy nodes were not found",
        );
      }
    } catch (error) {
      if (error instanceof RegistryOperationError) {
        throw error;
      }

      throw new RegistryOperationError(
        "One or more strategy nodes were not found",
      );
    }
  }
}

/**
 * Kept only for isolated tests or explicit non-production use.
 */
export class UnverifiedStrategyNodeGateway implements StrategyNodeGateway {
  readonly canVerify = false;

  assertNodesExist(): Promise<void> {
    return Promise.resolve();
  }

  assertObjectiveExists(): Promise<void> {
    return Promise.resolve();
  }
}
