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
  rollup: {
    rollupResultId: string;
    parentKpiId: string;
    aggregatedValue: number | null;
    method: string;
    ruleVersionUsed: string;
    alreadyComputed: boolean;
  } | null;
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
    const binding = await this.bindings.findByKpiVersion(
      request.kpiVersionId,
    );

    if (!binding) {
      throw performanceErrors.kpiBindingNotFound(request.kpiVersionId);
    }

    const status = binding.thresholdRuleKey
      ? await this.evaluateStatus(request, binding.thresholdRuleKey)
      : null;

    const rollup = binding.parentKpiId
      ? await this.evaluateRollup(request, binding.parentKpiId)
      : null;

    return { status, rollup };
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

    // Breach fires on the *crossing* only. An unchanged off-track status, or a
    // recovery out of off-track, computes a status and emits nothing else.
    const breached =
      isOffTrack(status) &&
      (previousStatus === null || !isOffTrack(previousStatus));

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
  ): Promise<RecomputeOutcome["rollup"]> {
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

    const parent = await this.bindings.findActiveByKpi(parentKpiId);

    if (!parent?.rollupRuleKey) {
      this.logger.debug("Parent KPI has no rollup rule configured", {
        eventId: request.triggerEventId,
        parentKpiId,
      });
      return null;
    }

    const children = await this.bindings.findActiveChildren(parentKpiId);

    const childValues = await Promise.all(
      children.map(async (child) => {
        const measurement = await this.measurements.resolveCurrent({
          kpiVersionId: child.kpiVersionId,
          scopeNodeId: request.scopeNodeId,
          period: request.period,
        });

        return {
          id: child.kpiId,
          value: measurement?.value ?? null,
        };
      }),
    );

    const rule = await this.requirePublishedRule(parent.rollupRuleKey);

    const evaluation = await this.evaluateWithRuleEngine(
      rule,
      { children: childValues },
      parent.rollupRuleKey,
    );

    if (!("includedChildIds" in evaluation)) {
      throw performanceErrors.ruleEvaluationFailed(parent.rollupRuleKey);
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
        ruleKey: parent.rollupRuleKey,
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
