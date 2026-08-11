import type { PrismaService } from "../../database/prisma.service";

export interface StatusResultView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  status: string;
  computedAt: Date;
  ruleVersionUsed: string;
}

export interface RollupResultView {
  id: string;
  parentKpiId: string;
  scopeNodeId: string;
  period: string;
  aggregatedValue: number | null;
  method: string;
  computedAt: Date;
  ruleVersionUsed: string;
}

/**
 * Read access to what the Rule Engine produced. Both getters return the latest
 * result for the requested coordinates; earlier results are retained as
 * history rather than overwritten.
 */
export class PerformanceResultsService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
  }): Promise<StatusResultView | null> {
    const record = await this.prisma.statusResult.findFirst({
      where: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
      },
      orderBy: [{ computedAt: "desc" }, { id: "desc" }],
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      kpiVersionId: record.kpiVersionId,
      scopeNodeId: record.scopeNodeId,
      period: record.period,
      status: record.status,
      computedAt: record.computedAt,
      ruleVersionUsed: record.ruleVersionUsed,
    };
  }

  async getRollup(input: {
    parentKpiId: string;
    scopeNodeId: string;
    period: string;
  }): Promise<RollupResultView | null> {
    const record = await this.prisma.rollupResult.findFirst({
      where: {
        parentKpiId: input.parentKpiId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
      },
      orderBy: [{ computedAt: "desc" }, { id: "desc" }],
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      parentKpiId: record.parentKpiId,
      scopeNodeId: record.scopeNodeId,
      period: record.period,
      aggregatedValue:
        record.aggregatedValue === null
          ? null
          : Number(record.aggregatedValue.toString()),
      method: record.method,
      computedAt: record.computedAt,
      ruleVersionUsed: record.ruleVersionUsed,
    };
  }
}
