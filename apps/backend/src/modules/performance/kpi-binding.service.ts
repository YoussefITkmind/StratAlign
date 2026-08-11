import type { PrismaService } from "../../database/prisma.service";

export interface KpiBindingView {
  id: string;
  kpiVersionId: string;
  thresholdRuleKey: string | null;
}

export interface UpsertKpiBindingInput {
  kpiVersionId: string;
  thresholdRuleKey?: string | null;
}

/**
 * TEMPORARY THRESHOLD-RULE SEAM.
 *
 * Registry 2.4 now owns KPI identity, active-version selection and hierarchy.
 * This adapter deliberately stores none of those facts.
 *
 * It exists only because Prompt 2.6 has not yet supplied the permanent
 * KPI -> threshold-rule binding. Once 2.6 lands, RecomputeService should read
 * that binding and this service/table should be removed.
 */
export class KpiBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    input: UpsertKpiBindingInput,
  ): Promise<KpiBindingView> {
    return this.prisma.performanceKpiBinding.upsert({
      where: { kpiVersionId: input.kpiVersionId },
      update: {
        thresholdRuleKey: input.thresholdRuleKey ?? null,
      },
      create: {
        kpiVersionId: input.kpiVersionId,
        thresholdRuleKey: input.thresholdRuleKey ?? null,
      },
      select: {
        id: true,
        kpiVersionId: true,
        thresholdRuleKey: true,
      },
    });
  }

  async findByKpiVersion(
    kpiVersionId: string,
  ): Promise<KpiBindingView | null> {
    return this.prisma.performanceKpiBinding.findUnique({
      where: { kpiVersionId },
      select: {
        id: true,
        kpiVersionId: true,
        thresholdRuleKey: true,
      },
    });
  }
}
