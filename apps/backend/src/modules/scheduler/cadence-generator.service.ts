import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import type { QueueService } from "../../queue/queue.service";
import { JOB_NAMES, QUEUE_NAMES, buildJobId } from "../../queue/queue.constants";
import type { Prisma } from "../../generated/prisma/client";
import {
  CadenceInstanceStatus,
  CadenceStatus,
  CatchUpPolicy,
} from "../../generated/prisma/enums";
import type { CadenceEngine } from "../cadence/cadence.engine";
import { parseCadenceSpec } from "../cadence/cadence.spec.schema";
import type {
  PeriodCalendarEngine,
  ResolvedPeriod,
} from "../cadence/period-calendar.engine";

const MINUTE_MS = 60 * 1000;

/**
 * How far back a single materialisation pass will ever look, regardless of how
 * stale `lastMaterializedAt` is. A definition that has not run for a year must
 * not try to generate a year of history in one job.
 */
const MAX_CATCHUP_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

export interface GeneratorConfig {
  maxCatchUpOccurrences: number;
  /** Occurrences closer than this get an exact delayed job, not just a tick. */
  tickIntervalMs: number;
}

export interface MaterializationResult {
  created: number;
  skipped: number;
  nextOccurrenceAt: Date | null;
}

interface PlannedInstance {
  occurrenceAt: Date;
  status: CadenceInstanceStatus;
  skipReason: string | null;
  windowOpensAt: Date;
  windowClosingAt: Date;
  windowClosesAt: Date;
  reviewDueAt: Date;
  period: ResolvedPeriod | null;
}

/**
 * Turns a cadence definition into concrete instances.
 *
 * Postgres is the source of truth: instances are derived from the definition
 * and persisted, so a Redis flush loses nothing. The uniqueness of
 * `(cadence_definition_id, occurrence_at)` is what makes the whole pass safely
 * repeatable — a duplicate tick, a retry, or two racing workers converge on
 * the same rows instead of double-firing.
 */
export class CadenceGeneratorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadenceEngine: CadenceEngine,
    private readonly periodCalendarEngine: PeriodCalendarEngine,
    private readonly queueService: QueueService,
    private readonly config: GeneratorConfig,
    private readonly logger: Logger,
  ) {}

  async materialize(
    cadenceDefinitionId: string,
    now = new Date(),
  ): Promise<MaterializationResult> {
    const definition = await this.prisma.cadenceDefinition.findUnique({
      where: { id: cadenceDefinitionId },
      include: { periodCalendar: true },
    });

    if (!definition || definition.status !== CadenceStatus.ACTIVE) {
      return { created: 0, skipped: 0, nextOccurrenceAt: null };
    }

    const spec = parseCadenceSpec(definition.cadenceConfig);

    const windowStart = new Date(
      Math.max(
        definition.lastMaterializedAt?.getTime() ?? definition.startsAt.getTime(),
        definition.startsAt.getTime(),
        now.getTime() - MAX_CATCHUP_WINDOW_MS,
      ),
    );

    const lookaheadEnd = now.getTime() + definition.lookaheadSeconds * 1000;
    const windowEnd = new Date(
      definition.endsAt === null
        ? lookaheadEnd
        : Math.min(lookaheadEnd, definition.endsAt.getTime()),
    );

    if (windowEnd.getTime() <= windowStart.getTime()) {
      const next = await this.advanceDefinitionCursor(definition.id, now);
      return { created: 0, skipped: 0, nextOccurrenceAt: next };
    }

    const occurrences = this.cadenceEngine.occurrencesBetween({
      spec,
      timeZone: definition.timezone,
      anchorAt: definition.anchorAt,
      from: windowStart,
      to: windowEnd,
      // One over the cap so an overflowing catch-up is detectable rather than
      // silently truncated at exactly the limit.
      maxOccurrences: this.config.maxCatchUpOccurrences + 1,
    });

    const planned = this.planInstances(definition, occurrences, now);

    if (planned.length === 0) {
      const next = await this.advanceDefinitionCursor(definition.id, windowEnd);
      return { created: 0, skipped: 0, nextOccurrenceAt: next };
    }

    const createdCount = await this.persist(definition.id, planned, windowEnd);
    const nextOccurrenceAt = await this.advanceDefinitionCursor(
      definition.id,
      windowEnd,
    );

    await this.scheduleImminentTransitions(definition.id, planned, now);

    const skipped = planned.filter(
      (instance) => instance.status === CadenceInstanceStatus.SKIPPED,
    ).length;

    this.logger.info("Materialised cadence instances", {
      cadenceDefinitionId: definition.id,
      planned: planned.length,
      created: createdCount,
      skipped,
      windowStart: windowStart.toISOString(),
      windowEnd: windowEnd.toISOString(),
    });

    return { created: createdCount, skipped, nextOccurrenceAt };
  }

  /**
   * Applies the catch-up policy and derives each occurrence's milestones.
   *
   * Occurrences dropped by policy are still recorded, as SKIPPED rows with a
   * reason. Silently discarding them would leave an unexplained gap in the
   * history of a definition.
   */
  private planInstances(
    definition: {
      catchUpPolicy: CatchUpPolicy;
      windowOpenOffsetMinutes: number;
      windowDurationMinutes: number;
      closingWarningMinutes: number;
      reviewDueOffsetMinutes: number;
      timezone: string;
      periodCalendar: {
        periodType: import("../../generated/prisma/enums").PeriodType;
        fiscalYearStartMonth: number;
        timezone: string;
      } | null;
    },
    occurrences: readonly Date[],
    now: Date,
  ): PlannedInstance[] {
    const past = occurrences.filter((occurrence) => occurrence.getTime() < now.getTime());
    const future = occurrences.filter((occurrence) => occurrence.getTime() >= now.getTime());

    const keptPast = this.applyCatchUpPolicy(definition.catchUpPolicy, past);
    const overflow = Math.max(0, keptPast.kept.length - this.config.maxCatchUpOccurrences);
    const cappedPast = keptPast.kept.slice(overflow);

    const skippedOccurrences = new Map<number, string>();

    for (const occurrence of keptPast.skipped) {
      skippedOccurrences.set(occurrence.getTime(), keptPast.reason);
    }

    for (const occurrence of keptPast.kept.slice(0, overflow)) {
      skippedOccurrences.set(
        occurrence.getTime(),
        `Exceeded the catch-up cap of ${this.config.maxCatchUpOccurrences} occurrences`,
      );
    }

    const ordered = [...past, ...future].sort(
      (left, right) => left.getTime() - right.getTime(),
    );

    const retained = new Set(
      [...cappedPast, ...future].map((occurrence) => occurrence.getTime()),
    );

    return ordered.map((occurrenceAt) => {
      const skipReason = skippedOccurrences.get(occurrenceAt.getTime()) ?? null;
      const isRetained = retained.has(occurrenceAt.getTime()) && skipReason === null;

      const windowOpensAt = new Date(
        occurrenceAt.getTime() + definition.windowOpenOffsetMinutes * MINUTE_MS,
      );
      const windowClosesAt = new Date(
        windowOpensAt.getTime() + definition.windowDurationMinutes * MINUTE_MS,
      );
      // A warning longer than the window itself would otherwise land before the
      // window even opens.
      const windowClosingAt = new Date(
        Math.max(
          windowOpensAt.getTime(),
          windowClosesAt.getTime() - definition.closingWarningMinutes * MINUTE_MS,
        ),
      );
      const reviewDueAt = new Date(
        windowClosesAt.getTime() + definition.reviewDueOffsetMinutes * MINUTE_MS,
      );

      const period =
        definition.periodCalendar === null
          ? null
          : this.periodCalendarEngine.resolvePeriod(
              definition.periodCalendar,
              occurrenceAt,
            );

      return {
        occurrenceAt,
        status: isRetained
          ? CadenceInstanceStatus.PENDING
          : CadenceInstanceStatus.SKIPPED,
        skipReason,
        windowOpensAt,
        windowClosingAt,
        windowClosesAt,
        reviewDueAt,
        period,
      };
    });
  }

  private applyCatchUpPolicy(
    policy: CatchUpPolicy,
    past: readonly Date[],
  ): { kept: Date[]; skipped: Date[]; reason: string } {
    if (policy === CatchUpPolicy.FIRE_ALL) {
      return { kept: [...past], skipped: [], reason: "" };
    }

    if (policy === CatchUpPolicy.SKIP_MISSED) {
      return {
        kept: [],
        skipped: [...past],
        reason: "Missed occurrence skipped by SKIP_MISSED policy",
      };
    }

    // FIRE_LATEST_ONLY
    const latest = past.at(-1);

    return {
      kept: latest === undefined ? [] : [latest],
      skipped: past.slice(0, -1),
      reason: "Superseded by a later occurrence under FIRE_LATEST_ONLY policy",
    };
  }

  private async persist(
    cadenceDefinitionId: string,
    planned: readonly PlannedInstance[],
    windowEnd: Date,
  ): Promise<number> {
    return this.prisma.$transaction(async (tx) => {
      const highest = await tx.cadenceInstance.aggregate({
        where: { cadenceDefinitionId },
        _max: { sequence: true },
      });

      const sequenceBase = (highest._max.sequence ?? -1) + 1;

      const definition = await tx.cadenceDefinition.findUniqueOrThrow({
        where: { id: cadenceDefinitionId },
        select: { payload: true },
      });

      const result = await tx.cadenceInstance.createMany({
        data: planned.map((instance, index) => ({
          cadenceDefinitionId,
          sequence: sequenceBase + index,
          occurrenceAt: instance.occurrenceAt,
          periodKey: instance.period?.key ?? null,
          periodStartsAt: instance.period?.startsAt ?? null,
          periodEndsAt: instance.period?.endsAt ?? null,
          windowOpensAt: instance.windowOpensAt,
          windowClosingAt: instance.windowClosingAt,
          windowClosesAt: instance.windowClosesAt,
          reviewDueAt: instance.reviewDueAt,
          status: instance.status,
          skipReason: instance.skipReason,
          nextTransitionAt:
            instance.status === CadenceInstanceStatus.PENDING
              ? instance.windowOpensAt
              : null,
          payloadSnapshot: definition.payload as Prisma.InputJsonValue,
        })),
        // Concurrent or replayed materialisation converges here instead of
        // creating duplicate occurrences.
        skipDuplicates: true,
      });

      await tx.cadenceDefinition.update({
        where: { id: cadenceDefinitionId },
        data: {
          lastMaterializedAt: windowEnd,
          version: { increment: 1 },
        },
      });

      return result.count;
    });
  }

  /**
   * The tick alone gives tick-interval precision. For milestones landing
   * inside the next tick, an exact delayed job is enqueued as well. Both paths
   * are idempotent, so whichever fires first wins and the other is a no-op.
   */
  private async scheduleImminentTransitions(
    cadenceDefinitionId: string,
    planned: readonly PlannedInstance[],
    now: Date,
  ): Promise<void> {
    const horizon = now.getTime() + this.config.tickIntervalMs;

    const imminent = planned.filter(
      (instance) =>
        instance.status === CadenceInstanceStatus.PENDING &&
        instance.windowOpensAt.getTime() <= horizon,
    );

    if (imminent.length === 0) {
      return;
    }

    const instances = await this.prisma.cadenceInstance.findMany({
      where: {
        cadenceDefinitionId,
        occurrenceAt: { in: imminent.map((instance) => instance.occurrenceAt) },
        status: CadenceInstanceStatus.PENDING,
      },
      select: { id: true, status: true, nextTransitionAt: true },
    });

    for (const instance of instances) {
      if (instance.nextTransitionAt === null) {
        continue;
      }

      await this.queueService.enqueue(
        QUEUE_NAMES.schedulerTransition,
        JOB_NAMES.advanceInstance,
        { cadenceInstanceId: instance.id },
        {
          jobId: buildJobId("advance", instance.id, instance.status),
          delayMs: Math.max(0, instance.nextTransitionAt.getTime() - now.getTime()),
        },
      );
    }
  }

  private async advanceDefinitionCursor(
    cadenceDefinitionId: string,
    materializedThrough: Date,
  ): Promise<Date | null> {
    const definition = await this.prisma.cadenceDefinition.findUniqueOrThrow({
      where: { id: cadenceDefinitionId },
    });

    const spec = parseCadenceSpec(definition.cadenceConfig);

    const next = this.cadenceEngine.nextOccurrenceAfter({
      spec,
      timeZone: definition.timezone,
      anchorAt: definition.anchorAt,
      from: materializedThrough,
    });

    const withinWindow =
      next !== null &&
      (definition.endsAt === null || next.getTime() < definition.endsAt.getTime());

    // A cadence with nothing left to fire is completed rather than left ACTIVE
    // with a null cursor, so the tick query stops considering it entirely.
    const exhausted = !withinWindow;

    await this.prisma.cadenceDefinition.update({
      where: { id: cadenceDefinitionId },
      data: {
        lastMaterializedAt: materializedThrough,
        nextOccurrenceAt: withinWindow ? next : null,
        status: exhausted ? CadenceStatus.COMPLETED : definition.status,
      },
    });

    return withinWindow ? next : null;
  }
}
