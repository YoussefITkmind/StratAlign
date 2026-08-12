import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";

import type { StrategyNodeGateway } from "./gateways/strategy-node.gateway";
import { RegistryOperationError } from "./registry.errors";
import {
  decimalToNumber,
  fromKeyResultTypeView,
  toKeyResultTypeView,
} from "./registry.mappers";
import type {
  KeyResultTypeView,
  KeyResultView,
  OkrView,
} from "./registry.types";

export interface CreateOkrInput {
  objectiveNodeId: string;
  nameEn: string;
  nameAr: string;
  keyResults: CreateKeyResultInput[];
}

export interface CreateKeyResultInput {
  type: KeyResultTypeView;
  targetValue: number;
  unit: string;
}

export interface UpdateKeyResultProgressInput {
  keyResultId: string;
  currentValue: number;
}

/** Persisted shapes the mappers below read, kept narrow on purpose. */
interface KeyResultRow {
  id: string;
  okrId: string;
  type: "QUANTITATIVE" | "MILESTONE";
  targetValue: Prisma.Decimal;
  unit: string;
  currentValue: Prisma.Decimal | null;
  progressUpdatedAt: Date | null;
}

interface OkrRow {
  id: string;
  objectiveNodeId: string;
  nameEn: string;
  nameAr: string;
  createdAt: Date;
  updatedAt: Date;
  keyResults: KeyResultRow[];
}

/**
 * OKRs and their key results.
 *
 * An OKR hangs off an objective strategy node. That node is owned by the
 * Strategy module, so existence and type are checked through the configured
 * `StrategyNodeGateway` without duplicating Strategy write ownership.
 */
export class OkrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategyNodes: StrategyNodeGateway,
  ) {}

  async create(input: CreateOkrInput): Promise<OkrView> {
    const objectiveNodeId = input.objectiveNodeId.trim();
    const nameEn = input.nameEn.trim();
    const nameAr = input.nameAr.trim();

    if (!objectiveNodeId) {
      throw new RegistryOperationError("An objective node id is required");
    }

    if (!nameEn || !nameAr) {
      throw new RegistryOperationError(
        "English and Arabic names are both required",
      );
    }

    if (input.keyResults.length === 0) {
      throw new RegistryOperationError(
        "An OKR requires at least one key result",
      );
    }

    for (const keyResult of input.keyResults) {
      if (!Number.isFinite(keyResult.targetValue)) {
        throw new RegistryOperationError(
          "Key result targets must be finite numbers",
        );
      }

      if (!keyResult.unit.trim()) {
        throw new RegistryOperationError(
          "Every key result requires a unit",
        );
      }
    }

    await this.strategyNodes.assertObjectiveExists(objectiveNodeId);

    try {
      // One transaction so an OKR is never persisted without its key
      // results — the pair is meaningless apart.
      const created = await this.prisma.$transaction(async (tx) => {
        const okr = await tx.okr.create({
          data: { objectiveNodeId, nameEn, nameAr },
        });

        await tx.keyResult.createMany({
          data: input.keyResults.map((keyResult) => ({
            okrId: okr.id,
            type: fromKeyResultTypeView(keyResult.type),
            targetValue: keyResult.targetValue,
            unit: keyResult.unit.trim(),
          })),
        });

        return tx.okr.findUniqueOrThrow({
          where: { id: okr.id },
          include: { keyResults: { orderBy: { createdAt: "asc" } } },
        });
      });

      return this.toOkrView(created);
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  /**
   * Records the latest value for a key result.
   *
   * Prompt 2.4 carries no measurement model, so this overwrites the value on
   * the key result rather than appending to a time series.
   *
   * TODO(Phase 3): move progress onto the measurement store once it exists,
   * and derive the current value from it instead of storing it here.
   */
  async updateProgress(
    input: UpdateKeyResultProgressInput,
  ): Promise<KeyResultView> {
    if (!Number.isFinite(input.currentValue)) {
      throw new RegistryOperationError(
        "Progress must be a finite number",
      );
    }

    try {
      const existing = await this.prisma.keyResult.findUnique({
        where: { id: input.keyResultId },
        select: { id: true },
      });

      if (!existing) {
        throw new RegistryOperationError("Key result was not found");
      }

      const updated = await this.prisma.keyResult.update({
        where: { id: input.keyResultId },
        data: {
          currentValue: input.currentValue,
          progressUpdatedAt: new Date(),
        },
      });

      return this.toKeyResultView(updated);
    } catch (error) {
      throw this.rethrow(error);
    }
  }

  async getById(okrId: string): Promise<OkrView | null> {
    const okr = await this.prisma.okr.findUnique({
      where: { id: okrId },
      include: { keyResults: { orderBy: { createdAt: "asc" } } },
    });

    return okr ? this.toOkrView(okr) : null;
  }

  async list(): Promise<OkrView[]> {
    const okrs = await this.prisma.okr.findMany({
      include: { keyResults: { orderBy: { createdAt: "asc" } } },
      orderBy: { createdAt: "asc" },
    });

    return okrs.map((okr) => this.toOkrView(okr));
  }

  private toOkrView(okr: OkrRow): OkrView {
    return {
      id: okr.id,
      objectiveNodeId: okr.objectiveNodeId,
      nameEn: okr.nameEn,
      nameAr: okr.nameAr,
      createdAt: okr.createdAt,
      updatedAt: okr.updatedAt,
      keyResults: okr.keyResults.map((keyResult) =>
        this.toKeyResultView(keyResult),
      ),
    };
  }

  private toKeyResultView(keyResult: KeyResultRow): KeyResultView {
    const targetValue = decimalToNumber(keyResult.targetValue);
    const currentValue = decimalToNumber(keyResult.currentValue);

    return {
      id: keyResult.id,
      okrId: keyResult.okrId,
      type: toKeyResultTypeView(keyResult.type),
      targetValue,
      unit: keyResult.unit,
      currentValue,
      progressPercent: this.progressPercent(currentValue, targetValue),
      progressUpdatedAt: keyResult.progressUpdatedAt,
    };
  }

  /**
   * Progress is undefined until a value is recorded, and against a zero
   * target — the percentage would divide by zero rather than mean anything.
   */
  private progressPercent(
    currentValue: number | null,
    targetValue: number,
  ): number | null {
    if (currentValue === null || targetValue === 0) {
      return null;
    }

    return (currentValue / targetValue) * 100;
  }

  private rethrow(error: unknown): Error {
    return error instanceof RegistryOperationError
      ? error
      : new RegistryOperationError();
  }
}
