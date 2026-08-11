import type { PrismaService } from "../../database/prisma.service";

export interface KpiBindingView {
  id: string;
  kpiId: string;
  kpiVersionId: string;
  isActive: boolean;
  thresholdRuleKey: string | null;
  rollupRuleKey: string | null;
  parentKpiId: string | null;
}

export interface UpsertKpiBindingInput {
  kpiId: string;
  kpiVersionId: string;
  thresholdRuleKey?: string | null;
  rollupRuleKey?: string | null;
  parentKpiId?: string | null;
  isActive?: boolean;
}

/**
 * TEMPORARY BRIDGE — see the module README, "Blockers".
 *
 * The recompute worker needs three facts that belong to the KPI/OKR registry
 * (Prompt 2.4): which version of a KPI is active, which published rule
 * evaluates it, and which KPI is its hierarchy parent. That registry does not
 * exist in this repository, so those bindings are held here and nowhere else.
 *
 * This is not a KPI registry: it stores no name, owner, unit, definition or
 * version history, and it has no lifecycle of its own. When Prompt 2.4 lands,
 * this service becomes a thin adapter over the registry — or is deleted, with
 * `RecomputeService` reading the registry directly.
 */
export class KpiBindingService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    input: UpsertKpiBindingInput,
  ): Promise<KpiBindingView> {
    const record = await this.prisma.performanceKpiBinding.upsert({
      where: { kpiVersionId: input.kpiVersionId },
      update: {
        kpiId: input.kpiId,
        thresholdRuleKey: input.thresholdRuleKey ?? null,
        rollupRuleKey: input.rollupRuleKey ?? null,
        parentKpiId: input.parentKpiId ?? null,
        isActive: input.isActive ?? true,
      },
      create: {
        kpiId: input.kpiId,
        kpiVersionId: input.kpiVersionId,
        thresholdRuleKey: input.thresholdRuleKey ?? null,
        rollupRuleKey: input.rollupRuleKey ?? null,
        parentKpiId: input.parentKpiId ?? null,
        isActive: input.isActive ?? true,
      },
    });

    return record;
  }

  /** Binding for one KPI version, active or not. */
  async findByKpiVersion(
    kpiVersionId: string,
  ): Promise<KpiBindingView | null> {
    return this.prisma.performanceKpiBinding.findUnique({
      where: { kpiVersionId },
    });
  }

  /** The active version binding for a logical KPI. */
  async findActiveByKpi(
    kpiId: string,
  ): Promise<KpiBindingView | null> {
    return this.prisma.performanceKpiBinding.findFirst({
      where: { kpiId, isActive: true },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Active bindings of every child of a parent KPI. */
  async findActiveChildren(
    parentKpiId: string,
  ): Promise<KpiBindingView[]> {
    return this.prisma.performanceKpiBinding.findMany({
      where: { parentKpiId, isActive: true },
      orderBy: { kpiId: "asc" },
    });
  }
}
