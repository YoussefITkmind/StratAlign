import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import { PermanentError } from "../../errors/app.errors";
import type { Prisma } from "../../generated/prisma/client";
import {
  CadenceStatus,
  CadenceType,
  CatchUpPolicy,
  CadenceInstanceStatus,
} from "../../generated/prisma/enums";
import type { CadenceEngine } from "../cadence/cadence.engine";
import { parseCadenceSpec } from "../cadence/cadence.spec.schema";
import type { CadenceSpec } from "../cadence/cadence.types";
import { isValidTimeZone } from "../cadence/timezone.util";

export interface CreateCadenceDefinitionInput {
  key: string;
  name: string;
  description?: string;
  /** Opaque to the scheduler; used by consumers to route events. */
  subjectType: string;
  subjectId: string;
  payload?: Record<string, unknown>;
  cadence: CadenceSpec;
  periodCalendarId?: string;
  timezone?: string;
  anchorAt?: Date;
  startsAt?: Date;
  endsAt?: Date;
  catchUpPolicy?: CatchUpPolicy;
  lookaheadSeconds?: number;
  windowOpenOffsetMinutes?: number;
  windowDurationMinutes?: number;
  closingWarningMinutes?: number;
  reviewDueOffsetMinutes?: number;
}

export interface SchedulerServiceConfig {
  defaultTimezone: string;
  defaultLookaheadSeconds: number;
}

/**
 * Lifecycle management for cadence definitions.
 *
 * Nothing in this service inspects `subjectType`, `subjectId` or `payload`
 * beyond storing them, which is the invariant the whole module rests on.
 */
export class SchedulerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cadenceEngine: CadenceEngine,
    private readonly config: SchedulerServiceConfig,
    private readonly logger: Logger,
  ) {}

  async createDefinition(input: CreateCadenceDefinitionInput) {
    const cadence = parseCadenceSpec(input.cadence);
    const timezone = input.timezone ?? this.config.defaultTimezone;

    if (!isValidTimeZone(timezone)) {
      throw new PermanentError(`Unknown IANA time zone: "${timezone}"`, {
        timezone,
      });
    }

    const now = new Date();
    const startsAt = input.startsAt ?? now;
    const anchorAt = input.anchorAt ?? startsAt;

    if (input.endsAt !== undefined && input.endsAt.getTime() <= startsAt.getTime()) {
      throw new PermanentError("endsAt must be after startsAt", {
        key: input.key,
      });
    }

    const nextOccurrenceAt = this.cadenceEngine.nextOccurrenceAfter({
      spec: cadence,
      timeZone: timezone,
      anchorAt,
      from: startsAt,
    });

    const definition = await this.prisma.cadenceDefinition.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description,
        subjectType: input.subjectType,
        subjectId: input.subjectId,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        cadenceType: cadence.type as CadenceType,
        cadenceConfig: cadence as unknown as Prisma.InputJsonValue,
        periodCalendarId: input.periodCalendarId,
        timezone,
        anchorAt,
        startsAt,
        endsAt: input.endsAt,
        catchUpPolicy: input.catchUpPolicy ?? CatchUpPolicy.FIRE_LATEST_ONLY,
        lookaheadSeconds:
          input.lookaheadSeconds ?? this.config.defaultLookaheadSeconds,
        windowOpenOffsetMinutes: input.windowOpenOffsetMinutes,
        windowDurationMinutes: input.windowDurationMinutes,
        closingWarningMinutes: input.closingWarningMinutes,
        reviewDueOffsetMinutes: input.reviewDueOffsetMinutes,
        nextOccurrenceAt,
      },
    });

    this.logger.info("Cadence definition created", {
      cadenceDefinitionId: definition.id,
      key: definition.key,
      subjectType: definition.subjectType,
      cadenceType: definition.cadenceType,
      nextOccurrenceAt: nextOccurrenceAt?.toISOString() ?? null,
    });

    return definition;
  }

  async pause(definitionId: string) {
    return this.setStatus(definitionId, CadenceStatus.PAUSED);
  }

  async resume(definitionId: string) {
    const definition = await this.setStatus(definitionId, CadenceStatus.ACTIVE);

    // A paused definition's nextOccurrenceAt is stale by the time it resumes.
    await this.recomputeNextOccurrence(definitionId);

    return definition;
  }

  /**
   * Cancels a definition and discards instances that have not started yet.
   * Instances already in flight are left alone so their history stays intact.
   */
  async cancel(definitionId: string, reason = "Definition cancelled") {
    return this.prisma.$transaction(async (tx) => {
      const definition = await tx.cadenceDefinition.update({
        where: { id: definitionId },
        data: {
          status: CadenceStatus.CANCELLED,
          nextOccurrenceAt: null,
        },
      });

      await tx.cadenceInstance.updateMany({
        where: {
          cadenceDefinitionId: definitionId,
          status: CadenceInstanceStatus.PENDING,
        },
        data: {
          status: CadenceInstanceStatus.SKIPPED,
          skipReason: reason,
          nextTransitionAt: null,
        },
      });

      return definition;
    });
  }

  async recomputeNextOccurrence(definitionId: string): Promise<Date | null> {
    const definition = await this.prisma.cadenceDefinition.findUniqueOrThrow({
      where: { id: definitionId },
    });

    const spec = parseCadenceSpec(definition.cadenceConfig);
    const from = definition.lastMaterializedAt ?? definition.startsAt;

    const next = this.cadenceEngine.nextOccurrenceAfter({
      spec,
      timeZone: definition.timezone,
      anchorAt: definition.anchorAt,
      from,
    });

    const withinWindow =
      next !== null &&
      (definition.endsAt === null || next.getTime() < definition.endsAt.getTime());

    await this.prisma.cadenceDefinition.update({
      where: { id: definitionId },
      data: { nextOccurrenceAt: withinWindow ? next : null },
    });

    return withinWindow ? next : null;
  }

  private async setStatus(definitionId: string, status: CadenceStatus) {
    const definition = await this.prisma.cadenceDefinition.update({
      where: { id: definitionId },
      data: { status },
    });

    this.logger.info("Cadence definition status changed", {
      cadenceDefinitionId: definitionId,
      status,
    });

    return definition;
  }
}
