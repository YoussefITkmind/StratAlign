import type { PrismaService } from "../../database/prisma.service";
import type { KpiThresholdRuleBindingView } from "./registry.types";

/** Registry-owned read boundary for consumers of the active threshold binding. */
export class ThresholdRuleBindingReader {
  constructor(private readonly prisma: PrismaService) {}

  async getThresholdRuleBinding(
    kpiVersionId: string,
  ): Promise<KpiThresholdRuleBindingView | null> {
    const binding = await this.prisma.kpiThresholdRuleBinding.findFirst({
      where: { kpiVersionId, isCurrent: true },
      include: { thresholdRule: true },
    });
    return binding ? {
      id: binding.id,
      kpiVersionId: binding.kpiVersionId,
      thresholdRuleId: binding.thresholdRuleId,
      ruleKey: binding.thresholdRule.ruleKey,
      ruleVersion: binding.thresholdRule.version,
      createdAt: binding.createdAt,
      createdBy: binding.createdById,
      supersedesBindingId: binding.supersedesId,
    } : null;
  }
}
