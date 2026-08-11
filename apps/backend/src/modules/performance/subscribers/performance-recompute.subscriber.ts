import { PermanentError } from "../../../errors/app.errors";
import type { EventSubscriber, DomainEventEnvelope } from "../../../events/event.types";
import type { Logger } from "../../../logging/logger";
import { SCHEDULE_EVENT_TYPES } from "../../scheduler/scheduler.events";
import { isPerformanceError } from "../performance.errors";
import {
  PERFORMANCE_EVENT_TYPES,
  PERFORMANCE_SCHEDULE_SUBJECT_TYPE,
} from "../performance.events";
import type { RecomputeService, RecomputeRequest } from "../recompute.service";

function readString(
  source: Record<string, unknown>,
  key: string,
): string | null {
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Drives KPI recomputation from the existing event infrastructure.
 *
 * Two inputs:
 *
 *  - `performance.measurement.recorded` — a measurement was appended, so the
 *    KPI it belongs to needs re-evaluating.
 *  - `schedule.window.closed` — a capture window closed, so the period needs a
 *    final evaluation even if nothing was captured late. The scheduler is
 *    generic and knows nothing about KPIs, so this subscriber filters on the
 *    definition's opaque `subjectType` and reads the KPI coordinates out of the
 *    frozen definition payload.
 *
 * Delivery is at-least-once. `RecomputeService` is idempotent per triggering
 * event id, so a redelivery writes nothing new.
 */
export class PerformanceRecomputeSubscriber implements EventSubscriber {
  readonly id = "performance-recompute";

  readonly eventTypes = [
    PERFORMANCE_EVENT_TYPES.measurementRecorded,
    SCHEDULE_EVENT_TYPES.windowClosed,
  ] as const;

  constructor(
    private readonly recompute: RecomputeService,
    private readonly logger: Logger,
  ) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    const request = this.toRequest(envelope);

    if (!request) {
      return;
    }

    try {
      await this.recompute.recompute(request);
    } catch (error: unknown) {
      // A missing published rule cannot be fixed by retrying; burning
      // attempts on it would only delay the dead letter.
      if (
        isPerformanceError(error) &&
        error.code === "RULE_NOT_FOUND"
      ) {
        this.logger.warn("Skipping recompute: KPI is not evaluable", {
          eventId: envelope.eventId,
          eventType: envelope.eventType,
          kpiVersionId: request.kpiVersionId,
          scopeNodeId: request.scopeNodeId,
          period: request.period,
          reason: error.code,
        });

        throw new PermanentError("KPI is not evaluable", {
          eventId: envelope.eventId,
          reason: error.code,
        });
      }

      this.logger.error("Recompute failed", error, {
        eventId: envelope.eventId,
        eventType: envelope.eventType,
        kpiVersionId: request.kpiVersionId,
        scopeNodeId: request.scopeNodeId,
        period: request.period,
      });

      throw error;
    }
  }

  private toRequest(
    envelope: DomainEventEnvelope,
  ): RecomputeRequest | null {
    if (
      envelope.eventType === PERFORMANCE_EVENT_TYPES.measurementRecorded
    ) {
      const kpiVersionId = readString(envelope.payload, "kpiVersionId");
      const scopeNodeId = readString(envelope.payload, "scopeNodeId");
      const period = readString(envelope.payload, "period");

      if (!kpiVersionId || !scopeNodeId || !period) {
        throw new PermanentError(
          "Malformed performance.measurement.recorded payload",
          { eventId: envelope.eventId },
        );
      }

      return {
        kpiVersionId,
        scopeNodeId,
        period,
        triggerEventId: envelope.eventId,
      };
    }

    if (envelope.eventType !== SCHEDULE_EVENT_TYPES.windowClosed) {
      return null;
    }

    if (
      readString(envelope.payload, "subjectType") !==
      PERFORMANCE_SCHEDULE_SUBJECT_TYPE
    ) {
      // Another module's schedule. Not an error — the scheduler fans out to
      // every subscriber and each one filters for its own subjects.
      return null;
    }

    const kpiVersionId = readString(envelope.payload, "subjectId");
    const period = readString(envelope.payload, "periodKey");

    const definitionPayload = envelope.payload["payload"];
    const scopeNodeId =
      typeof definitionPayload === "object" && definitionPayload !== null
        ? readString(
            definitionPayload as Record<string, unknown>,
            "scopeNodeId",
          )
        : null;

    if (!kpiVersionId || !scopeNodeId || !period) {
      this.logger.warn(
        "Ignoring performance schedule window without KPI coordinates",
        {
          eventId: envelope.eventId,
          hasKpiVersionId: kpiVersionId !== null,
          hasScopeNodeId: scopeNodeId !== null,
          hasPeriod: period !== null,
        },
      );
      return null;
    }

    return {
      kpiVersionId,
      scopeNodeId,
      period,
      triggerEventId: envelope.eventId,
    };
  }
}
