import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";
import type { Logger } from "../../logging/logger";
import { isUniqueConstraintViolation } from "../../errors/app.errors";
import type { EventPublicationRequest } from "../../events/event.types";
import type { RulesService, RuleDefinitionView } from "../rules/rules.service";
import type { KpiBindingService } from "./kpi-binding.service";
import type { MeasurementService } from "./measurement.service";
import { performanceErrors } from "./performance.errors";
import {
  KPI_PERFORMANCE_AGGREGATE_TYPE,
  OFF_TRACK_STATUS,
  PERFORMANCE_EVENT_TYPES,
  PERFORMANCE_EVENT_VERSION,
  performanceDedupeKey,
  type StatusComputedPayload,
  type ThresholdBreachedPayload,
} from "./performance.events";

export interface RecomputeRequest {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  /**
   * Identity of the event that triggered this recompute. It is the idempotency
   * anchor: a retried delivery of the same event recomputes to the same dedupe
   * keys and therefore writes nothing new.
   */
  triggerEventId: string;
}

export interface RecomputeOutcome {
  status: {
    statusResultId: string;
    status: string;
    previousStatus: string | null;
    ruleVersionUsed: string;
    breached: boolean;
    /** True when a previous run already produced this result. */
    alreadyComputed: boolean;
  } | null;
  rollups: Array<{
    rollupResultId: string;
    parentKpiId: string;
    aggregatedValue: number | null;
    method: string;
    ruleVersionUsed: string;
    alreadyComputed: boolean;
  }>;
}

function isOffTrack(status: string): boolean {
  return status.trim().toLowerCase() === OFF_TRACK_STATUS;
}

/**
 * Turns measurement and schedule events into Rule Engine evaluations.
 *
 * Performance owns *no* threshold or aggregation logic. It resolves the inputs
 * a rule needs, hands them to the existing Rule Engine through
 * `RulesService`, and persists what comes back. The published rule definition
 * row is recorded as `ruleVersionUsed`, so every stored status can be traced to
 * the exact immutable rule version that produced it.
 *
 * ## Retry safety
 *
 * Both result tables carry a `dedupe_key` unique index built from the logical
 * result identity plus the triggering event id. A redelivered event therefore
 * either finds its result already present and returns, or loses the race on the
 * unique index and treats that as success. Outbox rows use the same key shape,
 * so no duplicate `status.computed` or `threshold.breached` can escape.
 */
export class RecomputeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurements: MeasurementService,
    private readonly bindings: KpiBindingService,
    private readonly rules: RulesService,
    private readonly eventBus: EventBusService,
    private readonly logger: Logger,
  ) {}

  async recompute(
    request: RecomputeRequest,
  ): Promise<RecomputeOutcome> {
    // Registry is the source of truth for KPI identity and active version.
    const version = await this.prisma.kpiVersion.findUnique({
      where: { id: request.kpiVersionId },
      select: {
        kpiDefinitionId: true,
        kpiDefinition: {
          select: {
            status: true,
            activeVersionId: true,
          },
        },
      },
    });

    if (
      !version ||
      version.kpiDefinition.status !== "ACTIVE" ||
      version.kpiDefinition.activeVersionId !== request.kpiVersionId
    ) {
      this.logger.debug("Skipping recompute for a non-active KPI version", {
        eventId: request.triggerEventId,
        kpiVersionId: request.kpiVersionId,
      });

      return { status: null, rollups: [] };
    }

    // Temporary until Prompt 2.6 supplies the permanent threshold binding.
    const binding = await this.bindings.findByKpiVersion(
      request.kpiVersionId,
    );

    const status = binding?.thresholdRuleKey
      ? await this.evaluateStatus(request, binding.thresholdRuleKey)
      : null;

    // Registry hierarchy may legally expose more than one parent, so compute
    // every parent rather than keeping the old bridge's single-parent limit.
    const parentEdges = await this.prisma.kpiHierarchyNode.findMany({
      where: {
        childKpiId: version.kpiDefinitionId,
      },
      select: {
        parentKpiId: true,
      },
    });

    const parentKpiIds = [
      ...new Set(parentEdges.map((edge) => edge.parentKpiId)),
    ];

    const rollups = (
      await Promise.all(
        parentKpiIds.map((parentKpiId) =>
          this.evaluateRollup(request, parentKpiId),
        ),
      )
    ).filter(
      (
        rollup,
      ): rollup is RecomputeOutcome["rollups"][number] =>
        rollup !== null,
    );

    return { status, rollups };
  }

  private async evaluateStatus(
    request: RecomputeRequest,
    thresholdRuleKey: string,
  ): Promise<RecomputeOutcome["status"]> {
    const dedupeKey = performanceDedupeKey(
      PERFORMANCE_EVENT_TYPES.statusComputed,
      request.kpiVersionId,
      request.scopeNodeId,
      request.period,
      request.triggerEventId,
    );

    const alreadyComputed = await this.prisma.statusResult.findUnique({
      where: { dedupeKey },
    });

    if (alreadyComputed) {
      this.logger.debug("Status already computed for this event", {
        eventId: request.triggerEventId,
        statusResultId: alreadyComputed.id,
      });

      return {
        statusResultId: alreadyComputed.id,
        status: alreadyComputed.status,
        previousStatus: null,
        ruleVersionUsed: alreadyComputed.ruleVersionUsed,
        breached: false,
        alreadyComputed: true,
      };
    }

    const measurement = await this.measurements.resolveCurrent({
      kpiVersionId: request.kpiVersionId,
      scopeNodeId: request.scopeNodeId,
      period: request.period,
    });

    if (!measurement) {
      this.logger.debug("No effective measurement to evaluate", {
        eventId: request.triggerEventId,
        kpiVersionId: request.kpiVersionId,
        scopeNodeId: request.scopeNodeId,
        period: request.period,
      });
      return null;
    }

    const rule = await this.requirePublishedRule(thresholdRuleKey);

    const evaluation = await this.evaluateWithRuleEngine(
      rule,
      { value: measurement.value },
      thresholdRuleKey,
    );

    if (!("label" in evaluation)) {
      throw performanceErrors.ruleEvaluationFailed(thresholdRuleKey);
    }

    const status = evaluation.label;

    const previous = await this.prisma.statusResult.findFirst({
      where: {
        kpiVersionId: request.kpiVersionId,
        scopeNodeId: request.scopeNodeId,
        period: request.period,
      },
      orderBy: [{ computedAt: "desc" }, { id: "desc" }],
    });

    const previousStatus = previous?.status ?? null;

    // Breach fires only on an actual transition from an existing
    // non-off-track status into off-track. The first-ever status has no
    // previous state, so it cannot represent a crossing.
    const breached =
      previousStatus !== null &&
      isOffTrack(status) &&
      !isOffTrack(previousStatus);

    const computedAt = new Date();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.statusResult.create({
          data: {
            kpiVersionId: request.kpiVersionId,
            scopeNodeId: request.scopeNodeId,
            period: request.period,
            status,
            computedAt,
            ruleVersionUsed: rule.id,
            dedupeKey,
          },
        });

        const statusPayload: StatusComputedPayload = {
          statusResultId: created.id,
          kpiVersionId: request.kpiVersionId,
          scopeNodeId: request.scopeNodeId,
          period: request.period,
          status,
          previousStatus,
          ruleVersionUsed: rule.id,
          computedAt: computedAt.toISOString(),
        };

        const publications: EventPublicationRequest[] = [
          {
            eventType: PERFORMANCE_EVENT_TYPES.statusComputed,
            eventVersion: PERFORMANCE_EVENT_VERSION,
            aggregateType: KPI_PERFORMANCE_AGGREGATE_TYPE,
            aggregateId: request.kpiVersionId,
            dedupeKey,
            occurredAt: computedAt,
            payload: statusPayload as Record<string, unknown>,
          },
        ];

        if (breached) {
          const breachPayload: ThresholdBreachedPayload = {
            statusResultId: created.id,
            kpiVersionId: request.kpiVersionId,
            scopeNodeId: request.scopeNodeId,
            period: request.period,
            status,
            previousStatus,
            ruleVersionUsed: rule.id,
            breachedAt: computedAt.toISOString(),
          };

          publications.push({
            eventType: PERFORMANCE_EVENT_TYPES.thresholdBreached,
            eventVersion: PERFORMANCE_EVENT_VERSION,
            aggregateType: KPI_PERFORMANCE_AGGREGATE_TYPE,
            aggregateId: request.kpiVersionId,
            dedupeKey: performanceDedupeKey(
              PERFORMANCE_EVENT_TYPES.thresholdBreached,
              request.kpiVersionId,
              request.scopeNodeId,
              request.period,
              request.triggerEventId,
            ),
            occurredAt: computedAt,
            payload: breachPayload as Record<string, unknown>,
          });
        }

        await this.eventBus.publishWithin(tx, publications);

        return created;
      });

      await this.eventBus.nudgeRelay();

      this.logger.info("KPI status computed", {
        eventId: request.triggerEventId,
        statusResultId: result.id,
        kpiVersionId: request.kpiVersionId,
        scopeNodeId: request.scopeNodeId,
        period: request.period,
        ruleKey: thresholdRuleKey,
        ruleVersionUsed: rule.id,
        ruleVersion: rule.version,
        previousStatus,
        status,
        breached,
      });

      return {
        statusResultId: result.id,
        status,
        previousStatus,
        ruleVersionUsed: rule.id,
        breached,
        alreadyComputed: false,
      };
    } catch (error: unknown) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      // A concurrent delivery of the same event won the race. Its result is
      // the authoritative one.
      const existing = await this.prisma.statusResult.findUnique({
        where: { dedupeKey },
      });

      if (!existing) {
        throw error;
      }

      return {
        statusResultId: existing.id,
        status: existing.status,
        previousStatus,
        ruleVersionUsed: existing.ruleVersionUsed,
        breached: false,
        alreadyComputed: true,
      };
    }
  }

  private async evaluateRollup(
    request: RecomputeRequest,
    parentKpiId: string,
  ): Promise<RecomputeOutcome["rollups"][number] | null> {
    const dedupeKey = performanceDedupeKey(
      PERFORMANCE_EVENT_TYPES.statusComputed,
      "rollup",
      parentKpiId,
      request.scopeNodeId,
      request.period,
      request.triggerEventId,
    );

    const alreadyComputed = await this.prisma.rollupResult.findUnique({
      where: { dedupeKey },
    });

    if (alreadyComputed) {
      return {
        rollupResultId: alreadyComputed.id,
        parentKpiId,
        aggregatedValue:
          alreadyComputed.aggregatedValue === null
            ? null
            : Number(alreadyComputed.aggregatedValue.toString()),
        method: alreadyComputed.method,
        ruleVersionUsed: alreadyComputed.ruleVersionUsed,
        alreadyComputed: true,
      };
    }

    // Registry owns the hierarchy and the exact roll-up RuleDefinition.
    const edges = await this.prisma.kpiHierarchyNode.findMany({
      where: { parentKpiId },
      orderBy: { createdAt: "asc" },
      select: {
        rollupMethodRuleId: true,
        childKpi: {
          select: {
            id: true,
            status: true,
            activeVersionId: true,
          },
        },
      },
    });

    if (edges.length === 0) {
      this.logger.debug("Parent KPI has no Registry hierarchy children", {
        eventId: request.triggerEventId,
        parentKpiId,
      });
      return null;
    }

    const rollupRuleIds = new Set(
      edges.map((edge) => edge.rollupMethodRuleId),
    );

    // A parent must have one deterministic aggregation rule. If Registry has
    // conflicting rules across its child edges, fail instead of producing a
    // result that depends on which child event happened to arrive first.
    if (rollupRuleIds.size !== 1) {
      throw performanceErrors.ruleEvaluationFailed(
        `rollup:${parentKpiId}`,
      );
    }

    const rollupRuleId = edges[0]!.rollupMethodRuleId;

    const activeChildren = edges.filter(
      (edge) =>
        edge.childKpi.status === "ACTIVE" &&
        edge.childKpi.activeVersionId !== null,
    );

    const childValues = await Promise.all(
      activeChildren.map(async (edge) => {
        const kpiVersionId = edge.childKpi.activeVersionId!;

        const measurement = await this.measurements.resolveCurrent({
          kpiVersionId,
          scopeNodeId: request.scopeNodeId,
          period: request.period,
        });

        return {
          id: edge.childKpi.id,
          value: measurement?.value ?? null,
        };
      }),
    );

    const rule = await this.requirePublishedRuleById(rollupRuleId);

    const evaluation = await this.evaluateWithRuleEngine(
      rule,
      { children: childValues },
      rule.ruleKey,
    );

    if (!("includedChildIds" in evaluation)) {
      throw performanceErrors.ruleEvaluationFailed(rule.ruleKey);
    }

    // The method is read off the rule document rather than decided here, so the
    // Rule Engine stays the only place aggregation semantics live.
    const method =
      rule.document.ruleType === "rollup"
        ? rule.document.method
        : "unknown";

    const computedAt = new Date();

    try {
      const created = await this.prisma.rollupResult.create({
        data: {
          parentKpiId,
          scopeNodeId: request.scopeNodeId,
          period: request.period,
          aggregatedValue: evaluation.value,
          method,
          computedAt,
          ruleVersionUsed: rule.id,
          dedupeKey,
        },
      });

      this.logger.info("KPI rollup computed", {
        eventId: request.triggerEventId,
        rollupResultId: created.id,
        parentKpiId,
        scopeNodeId: request.scopeNodeId,
        period: request.period,
        ruleKey: rule.ruleKey,
        ruleVersionUsed: rule.id,
        ruleVersion: rule.version,
        method,
        aggregatedValue: evaluation.value,
        includedChildCount: evaluation.includedChildIds.length,
        excludedChildCount: evaluation.excludedChildIds.length,
      });

      return {
        rollupResultId: created.id,
        parentKpiId,
        aggregatedValue: evaluation.value,
        method,
        ruleVersionUsed: rule.id,
        alreadyComputed: false,
      };
    } catch (error: unknown) {
      if (!isUniqueConstraintViolation(error)) {
        throw error;
      }

      const existing = await this.prisma.rollupResult.findUnique({
        where: { dedupeKey },
      });

      if (!existing) {
        throw error;
      }

      return {
        rollupResultId: existing.id,
        parentKpiId,
        aggregatedValue:
          existing.aggregatedValue === null
            ? null
            : Number(existing.aggregatedValue.toString()),
        method: existing.method,
        ruleVersionUsed: existing.ruleVersionUsed,
        alreadyComputed: true,
      };
    }
  }

  private async requirePublishedRuleById(
    ruleId: string,
  ): Promise<RuleDefinitionView> {
    const stored = await this.prisma.ruleDefinition.findUnique({
      where: { id: ruleId },
      select: {
        id: true,
        ruleKey: true,
        version: true,
        status: true,
      },
    });

    if (!stored || stored.status !== "PUBLISHED") {
      throw performanceErrors.ruleNotFound(ruleId);
    }

    const rule = await this.rules.getVersion(
      stored.ruleKey,
      stored.version,
    );

    if (
      !rule ||
      rule.id !== ruleId ||
      rule.status !== "published"
    ) {
      throw performanceErrors.ruleNotFound(ruleId);
    }

    return rule;
  }

  private async requirePublishedRule(
    ruleKey: string,
  ): Promise<RuleDefinitionView> {
    const rule = await this.rules.getPublished(ruleKey);

    if (!rule) {
      throw performanceErrors.ruleNotFound(ruleKey);
    }

    return rule;
  }

  private async evaluateWithRuleEngine(
    rule: RuleDefinitionView,
    input: unknown,
    ruleKey: string,
  ) {
    try {
      return await this.rules.evaluate(rule.id, input);
    } catch (error: unknown) {
      this.logger.error("Rule evaluation failed", error, {
        ruleKey,
        ruleVersionUsed: rule.id,
      });
      throw performanceErrors.ruleEvaluationFailed(ruleKey);
    }
  }
}
