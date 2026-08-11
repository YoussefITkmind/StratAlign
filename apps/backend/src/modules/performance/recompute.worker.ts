import type { ThresholdStatusResult, RollupResult } from "@spm/rules";
import type { Logger } from "../../logging/logger";
import type { PrismaService } from "../../database/prisma.service";
import { EventBusService } from "../../events/event-bus.service";
import { RulesService } from "../rules/rules.service";
import type { DomainEventEnvelope } from "../../events/event.types";
import type { EventSubscriber } from "../../events/event.types";

export interface RecomputeJobData {
  measurementId?: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
}

export class PerformanceRecomputeSubscriber implements EventSubscriber {
  readonly id = "performance-recompute";
  readonly eventTypes = [
    "performance.measurement.recorded",
    "schedule.window.closed",
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly rulesService: RulesService,
    private readonly eventBus: EventBusService,
    private readonly logger: Logger,
  ) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    this.logger.info("Performance recompute triggered", {
      eventType: envelope.eventType,
      aggregateId: envelope.aggregateId,
    });

    try {
      if (envelope.eventType === "performance.measurement.recorded") {
        await this.handleMeasurementRecorded(envelope);
      } else if (envelope.eventType === "schedule.window.closed") {
        await this.handleWindowClosed(envelope);
      }
    } catch (error) {
      this.logger.error("Performance recompute failed", {
        eventType: envelope.eventType,
        aggregateId: envelope.aggregateId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async handleMeasurementRecorded(
    envelope: DomainEventEnvelope,
  ): Promise<void> {
    const payload = envelope.payload as {
      measurementId: string;
      kpiVersionId: string;
      scopeNodeId: string;
      period: string;
    };

    await this.recomputeForKpi(
      payload.kpiVersionId,
      payload.scopeNodeId,
      payload.period,
    );
  }

  private async handleWindowClosed(
    envelope: DomainEventEnvelope,
  ): Promise<void> {
    const payload = envelope.payload as {
      periodKey?: string;
      subjectType?: string;
      subjectId?: string;
    };

    // If window closed for a specific KPI, recompute that KPI
    if (payload.subjectType === "kpi" && payload.subjectId && payload.periodKey) {
      // Get active KPI version
      const kpiDefinition = await this.prisma.kpiDefinition.findUnique({
        where: { id: payload.subjectId },
        include: { activeVersion: true },
      });

      if (kpiDefinition?.activeVersion) {
        // TODO: Determine scopeNodeId from context - this will need strategy node integration
        // For now, recompute for all scope nodes that have measurements for this period
        await this.recomputeForKpiPeriod(
          kpiDefinition.activeVersion.id,
          payload.periodKey,
        );
      }
    }
  }

  private async recomputeForKpi(
    kpiVersionId: string,
    scopeNodeId: string,
    period: string,
  ): Promise<void> {
    // Get the KPI version to find its threshold rule
    const kpiVersion = await this.prisma.kpiVersion.findUnique({
      where: { id: kpiVersionId },
      include: { kpiDefinition: true },
    });

    if (!kpiVersion) {
      this.logger.warn("KPI version not found for recompute", { kpiVersionId });
      return;
    }

    // Get current measurement (head of supersession chain)
    // supersededBy is a nullable one-to-one relation; `is: null` means
    // no other measurement has superseded this one — it is the current head.
    const measurement = await this.prisma.measurement.findFirst({
      where: {
        kpiVersionId,
        scopeNodeId,
        period,
        supersededBy: { is: null },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!measurement) {
      this.logger.info("No measurement found for recompute", {
        kpiVersionId,
        scopeNodeId,
        period,
      });
      return;
    }

    // Get the KPI's threshold rule
    // This will be stored on KpiVersion when the rule builder integration is complete
    // For now, we'll look for a rule by key convention
    const ruleKey = `kpi-${kpiVersion.kpiDefinition.id}-threshold`;
    const rule = await this.rulesService.getPublished(ruleKey);

    if (!rule) {
      this.logger.info("No threshold rule found for KPI", { kpiVersionId });
      return;
    }

    // Evaluate the rule — the threshold rule input is { value: number }
    // and returns a ThresholdStatusResult with { label, color, matchedBandIndex }
    const rawResult = await this.rulesService.evaluate(rule.id, {
      value: measurement.value.toNumber(),
    });

    // Narrow to ThresholdStatusResult — we know the threshold rule returns this shape
    const result = rawResult as ThresholdStatusResult;

    // Get previous status to detect threshold breach
    const previousStatus = await this.prisma.statusResult.findUnique({
      where: {
        kpiVersionId_scopeNodeId_period: {
          kpiVersionId,
          scopeNodeId,
          period,
        },
      },
    });

    const wasOffTrack = previousStatus?.status === "off_track";
    const isOffTrack = result.label === "off_track";
    const crossedToOffTrack = !wasOffTrack && isOffTrack;

    // Store the status result
    await this.prisma.$transaction(async (tx) => {
      const statusResult = await tx.statusResult.upsert({
        where: {
          kpiVersionId_scopeNodeId_period: {
            kpiVersionId,
            scopeNodeId,
            period,
          },
        },
        create: {
          kpiVersionId,
          scopeNodeId,
          period,
          status: result.label,
          computedAt: new Date(),
          ruleVersionUsed: rule.id,
        },
        update: {
          status: result.label,
          computedAt: new Date(),
          ruleVersionUsed: rule.id,
        },
      });

      // Emit status computed event
      await this.eventBus.publishWithin(
        tx,
        [
          {
            eventType: "performance.status.computed",
            eventVersion: 1,
            aggregateType: "status_result",
            aggregateId: statusResult.id,
            dedupeKey: `status:${statusResult.id}`,
            payload: {
              statusResultId: statusResult.id,
              kpiVersionId,
              scopeNodeId,
              period,
              status: result.label,
              previousStatus: previousStatus?.status ?? null,
            },
          },
        ],
      );

      // Emit threshold breached event if crossed into off-track
      if (crossedToOffTrack) {
        await this.eventBus.publishWithin(
          tx,
          [
            {
              eventType: "performance.threshold.breached",
              eventVersion: 1,
              aggregateType: "measurement",
              aggregateId: measurement.id,
              dedupeKey: `breach:${measurement.id}:${Date.now()}`,
              payload: {
                measurementId: measurement.id,
                kpiVersionId,
                scopeNodeId,
                period,
                value: measurement.value.toNumber(),
                status: result.label,
                previousStatus: previousStatus?.status ?? null,
              },
            },
          ],
        );
      }
    });

    // Recompute rollups for parent KPIs
    await this.recomputeRollups(kpiVersionId, scopeNodeId, period);
  }

  private async recomputeForKpiPeriod(
    kpiVersionId: string,
    period: string,
  ): Promise<void> {
    // Get all measurements for this KPI version and period (head of each chain)
    const measurements = await this.prisma.measurement.findMany({
      where: {
        kpiVersionId,
        period,
        supersededBy: { is: null },
      },
      distinct: ["scopeNodeId"],
    });

    // Recompute for each scope node
    for (const measurement of measurements) {
      await this.recomputeForKpi(
        kpiVersionId,
        measurement.scopeNodeId,
        period,
      );
    }
  }

  private async recomputeRollups(
    kpiVersionId: string,
    scopeNodeId: string,
    period: string,
  ): Promise<void> {
    // Get KPI hierarchy to find parent KPIs
    const kpiVersion = await this.prisma.kpiVersion.findUnique({
      where: { id: kpiVersionId },
    });

    if (!kpiVersion) {
      return;
    }

    // Find hierarchy nodes where this KPI is a child
    const hierarchyNodes = await this.prisma.kpiHierarchyNode.findMany({
      where: { childKpiId: kpiVersion.kpiDefinitionId },
      include: {
        parentKpi: {
          include: { activeVersion: true },
        },
        rollupMethodRule: true,
      },
    });

    for (const node of hierarchyNodes) {
      if (!node.parentKpi.activeVersion || !node.rollupMethodRule) {
        continue;
      }

      // Get all child measurements for the parent KPI's scope
      const childNodes = await this.prisma.kpiHierarchyNode.findMany({
        where: { parentKpiId: node.parentKpi.id },
      });

      const childKpiIds = childNodes.map((n) => n.childKpiId);

      // Get measurements for all child KPIs (head of each chain)
      const childMeasurements = await this.prisma.measurement.findMany({
        where: {
          kpiVersion: {
            kpiDefinitionId: { in: childKpiIds },
          },
          scopeNodeId,
          period,
          supersededBy: { is: null },
        },
        include: {
          kpiVersion: true,
        },
      });

      if (childMeasurements.length === 0) {
        continue;
      }

      // Build RollupInput: children array with { id, value } per child KPI
      // Using kpiVersionId as the child identifier for weighted-average keying
      const rollupInput = {
        children: childMeasurements.map((m) => ({
          id: m.kpiVersionId,
          value: m.value.toNumber(),
        })),
      };

      // Evaluate rollup rule — returns a RollupResult with { value, includedChildIds, excludedChildIds }
      const rawRollupResult = await this.rulesService.evaluate(
        node.rollupMethodRule.id,
        rollupInput,
      );

      // Narrow to RollupResult
      const rollupResult = rawRollupResult as RollupResult;

      // Skip if aggregated value is null (e.g. all children were excluded)
      if (rollupResult.value === null) {
        this.logger.info("Rollup produced null — skipping upsert", {
          parentKpiId: node.parentKpi.id,
          scopeNodeId,
          period,
        });
        continue;
      }

      // Store rollup result; use the rule's document method for labelling
      const rollupRule = node.rollupMethodRule;
      const methodLabel =
        (rollupRule.documentJson as { method?: string } | null)?.method ??
        "unknown";

      await this.prisma.rollupResult.upsert({
        where: {
          parentKpiId_scopeNodeId_period: {
            parentKpiId: node.parentKpi.id,
            scopeNodeId,
            period,
          },
        },
        create: {
          parentKpiId: node.parentKpi.id,
          scopeNodeId,
          period,
          aggregatedValue: rollupResult.value,
          method: methodLabel,
        },
        update: {
          aggregatedValue: rollupResult.value,
          method: methodLabel,
        },
      });
    }
  }
}
