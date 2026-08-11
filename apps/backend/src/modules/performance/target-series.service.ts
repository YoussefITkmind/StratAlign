import type { PrismaService } from "../../database/prisma.service";

export interface TargetSeriesView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  targetValue: number;
  planVersionId: string;
}

export interface SetTargetInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  targetValue: number;
  /** Real Strategy PlanVersion that owns this target series. */
  planVersionId: string;
}

/**
 * Target values per KPI/scope/period and plan version.
 *
 * Targets are mutable — a revised plan overwrites its own series rather than
 * appending. Measurement immutability deliberately does not extend here: a
 * target is a statement of intent, not an observation of fact.
 */
export class TargetSeriesService {
  constructor(private readonly prisma: PrismaService) {}

  async setTarget(input: SetTargetInput): Promise<TargetSeriesView> {
    const planVersionId = input.planVersionId;

    const record = await this.prisma.targetSeries.upsert({
      where: {
        kpiVersionId_scopeNodeId_period_planVersionId: {
          kpiVersionId: input.kpiVersionId,
          scopeNodeId: input.scopeNodeId,
          period: input.period,
          planVersionId,
        },
      },
      update: { targetValue: input.targetValue },
      create: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
        planVersionId,
        targetValue: input.targetValue,
      },
    });

    return {
      id: record.id,
      kpiVersionId: record.kpiVersionId,
      scopeNodeId: record.scopeNodeId,
      period: record.period,
      targetValue: Number(record.targetValue.toString()),
      planVersionId: record.planVersionId,
    };
  }

  async getTarget(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    planVersionId: string;
  }): Promise<TargetSeriesView | null> {
    const record = await this.prisma.targetSeries.findUnique({
      where: {
        kpiVersionId_scopeNodeId_period_planVersionId: {
          kpiVersionId: input.kpiVersionId,
          scopeNodeId: input.scopeNodeId,
          period: input.period,
          planVersionId: input.planVersionId,
        },
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      kpiVersionId: record.kpiVersionId,
      scopeNodeId: record.scopeNodeId,
      period: record.period,
      targetValue: Number(record.targetValue.toString()),
      planVersionId: record.planVersionId,
    };
  }
}
