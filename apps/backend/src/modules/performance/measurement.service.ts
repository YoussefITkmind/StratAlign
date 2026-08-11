import type { Prisma } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";
import type { EventBusService } from "../../events/event-bus.service";
import type { Logger } from "../../logging/logger";
import { isUniqueConstraintViolation } from "../../errors/app.errors";
import {
  MEASUREMENT_AGGREGATE_TYPE,
  PERFORMANCE_EVENT_TYPES,
  PERFORMANCE_EVENT_VERSION,
  performanceDedupeKey,
  type MeasurementRecordedPayload,
} from "./performance.events";
import { performanceErrors } from "./performance.errors";

export type MeasurementSourceValue = "MANUAL" | "FEED" | "TEMPLATE";

export interface MeasurementView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  value: number;
  source: MeasurementSourceValue;
  locked: boolean;
  supersedesId: string | null;
  submittedBy: string;
  evidenceRef: string | null;
  createdAt: Date;
}

export interface RecordMeasurementInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  value: number;
  source: MeasurementSourceValue;
  locked?: boolean;
  /** Present when this row corrects an existing measurement. */
  supersedesId?: string | null;
  submittedBy: string;
  evidenceRef?: string | null;
}

export interface ListMeasurementsInput {
  kpiVersionId?: string;
  scopeNodeId?: string;
  period?: string;
  /**
   * Point in time to resolve against. Omitted means "currently effective",
   * which is resolved without a temporal predicate so a row inserted moments
   * ago cannot be filtered out by clock skew.
   */
  asOf?: Date;
  limit: number;
}

interface MeasurementRow {
  id: string;
  kpi_version_id: string;
  scope_node_id: string;
  period: string;
  value: string;
  source: string;
  locked: boolean;
  supersedes_id: string | null;
  submitted_by: string;
  evidence_ref: string | null;
  created_at: Date;
}

const SELECTED_COLUMNS = `
  m.id,
  m.kpi_version_id,
  m.scope_node_id,
  m.period,
  m.value::text AS value,
  m.source::text AS source,
  m.locked,
  m.supersedes_id,
  m.submitted_by,
  m.evidence_ref,
  m.created_at
`;

function toView(row: MeasurementRow): MeasurementView {
  return {
    id: row.id,
    kpiVersionId: row.kpi_version_id,
    scopeNodeId: row.scope_node_id,
    period: row.period,
    value: Number(row.value),
    source: row.source.toUpperCase() as MeasurementSourceValue,
    locked: row.locked,
    supersedesId: row.supersedes_id,
    submittedBy: row.submitted_by,
    evidenceRef: row.evidence_ref,
    createdAt: row.created_at,
  };
}

/**
 * Append-only measurement store.
 *
 * Nothing in this service updates or deletes a measurement, and nothing can:
 * the application database role holds only SELECT and INSERT on the table (see
 * the `performance_measurement_immutability` migration). The checks here exist
 * to produce a meaningful domain error before PostgreSQL produces an opaque
 * one, not to be the enforcement.
 *
 * ## Effective-measurement resolution
 *
 * A row is *effective* when no other row supersedes it. Point-in-time
 * resolution applies the same rule with the clock wound back: a row is
 * effective at `asOf` when it existed by then and nothing that existed by then
 * supersedes it. That is the same "valid_from/valid_to" reasoning the audit
 * snapshot service uses, expressed over the supersession chain rather than over
 * a separate history table.
 *
 * With M1 → M2 → M3 created at T1 < T2 < T3:
 *
 *   asOf < T1        no row existed yet          -> none
 *   T1 <= asOf < T2  M2 did not exist yet        -> M1
 *   T2 <= asOf < T3  M3 did not exist yet        -> M2
 *   asOf >= T3       nothing supersedes M3       -> M3
 */
export class MeasurementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
    private readonly logger: Logger,
  ) {}

  /**
   * Inserts a measurement. A correction passes `supersedesId`; the first
   * measurement for a KPI/scope/period does not.
   */
  async record(input: RecordMeasurementInput): Promise<MeasurementView> {
    const locked = input.locked ?? false;

    const created = await this.prisma.$transaction(async (tx) => {
      // Serialises concurrent corrections of the same series so two callers
      // cannot both read the same head and both try to supersede it.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`performance.measurement:${input.kpiVersionId}:${input.scopeNodeId}:${input.period}`}))`;

      await this.validateSupersession(tx, input);

      const measurement = await tx.measurement.create({
        data: {
          kpiVersionId: input.kpiVersionId,
          scopeNodeId: input.scopeNodeId,
          period: input.period,
          value: input.value,
          source: input.source,
          locked,
          supersedesId: input.supersedesId ?? null,
          submittedById: input.submittedBy,
          evidenceRef: input.evidenceRef ?? null,
        },
      });

      const payload: MeasurementRecordedPayload = {
        measurementId: measurement.id,
        kpiVersionId: measurement.kpiVersionId,
        scopeNodeId: measurement.scopeNodeId,
        period: measurement.period,
        source: measurement.source,
        locked: measurement.locked,
        supersedesId: measurement.supersedesId,
        recordedAt: measurement.createdAt.toISOString(),
      };

      await this.eventBus.publishWithin(tx, [
        {
          eventType: PERFORMANCE_EVENT_TYPES.measurementRecorded,
          eventVersion: PERFORMANCE_EVENT_VERSION,
          aggregateType: MEASUREMENT_AGGREGATE_TYPE,
          aggregateId: measurement.id,
          dedupeKey: performanceDedupeKey(
            PERFORMANCE_EVENT_TYPES.measurementRecorded,
            measurement.id,
          ),
          occurredAt: measurement.createdAt,
          payload,
        },
      ]);

      return measurement;
    });

    await this.eventBus.nudgeRelay();

    this.logger.debug("Measurement recorded", {
      measurementId: created.id,
      kpiVersionId: created.kpiVersionId,
      scopeNodeId: created.scopeNodeId,
      period: created.period,
      source: created.source,
      supersedesId: created.supersedesId,
    });

    return toView({
      id: created.id,
      kpi_version_id: created.kpiVersionId,
      scope_node_id: created.scopeNodeId,
      period: created.period,
      value: created.value.toString(),
      source: created.source,
      locked: created.locked,
      supersedes_id: created.supersedesId,
      submitted_by: created.submittedById,
      evidence_ref: created.evidenceRef,
      created_at: created.createdAt,
    });
  }

  /**
   * Rejects supersession relationships that would corrupt a chain, and enforces
   * the feed-lock invariant.
   */
  private async validateSupersession(
    tx: Prisma.TransactionClient,
    input: RecordMeasurementInput,
  ): Promise<void> {
    const effective = await this.resolveEffectiveWithin(tx, {
      kpiVersionId: input.kpiVersionId,
      scopeNodeId: input.scopeNodeId,
      period: input.period,
    });

    if (!input.supersedesId) {
      if (effective) {
        throw performanceErrors.invalidSupersession(
          "A measurement already exists for this KPI, scope and period; a correction must supersede it",
        );
      }
      return;
    }

    const target = await tx.measurement.findUnique({
      where: { id: input.supersedesId },
      include: { supersededBy: { select: { id: true } } },
    });

    if (!target) {
      throw performanceErrors.measurementNotFound();
    }

    if (
      target.kpiVersionId !== input.kpiVersionId ||
      target.scopeNodeId !== input.scopeNodeId ||
      target.period !== input.period
    ) {
      throw performanceErrors.invalidSupersession(
        "A correction must supersede a measurement for the same KPI, scope and period",
      );
    }

    if (target.supersededBy) {
      throw performanceErrors.invalidSupersession(
        "This measurement has already been corrected; supersede the current measurement instead",
      );
    }

    // Feed lock. A locked measurement is final for manual and template capture;
    // only a feed may replace it, which is what Phase 6 will produce.
    if (target.locked && input.source !== "FEED") {
      throw target.source === "FEED"
        ? performanceErrors.feedMeasurementLocked()
        : performanceErrors.measurementLocked();
    }
  }

  /** Currently effective measurement for one KPI/scope/period, or null. */
  async resolveCurrent(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
  }): Promise<MeasurementView | null> {
    return this.resolveEffectiveWithin(this.prisma, input);
  }

  /** The measurement that was effective at `asOf`, or null. */
  async resolveAsOf(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    asOf: Date;
  }): Promise<MeasurementView | null> {
    return this.resolveEffectiveWithin(this.prisma, input);
  }

  private async resolveEffectiveWithin(
    client: Pick<Prisma.TransactionClient, "$queryRawUnsafe">,
    input: {
      kpiVersionId: string;
      scopeNodeId: string;
      period: string;
      asOf?: Date;
    },
  ): Promise<MeasurementView | null> {
    const [row] = await this.queryEffective(client, {
      kpiVersionId: input.kpiVersionId,
      scopeNodeId: input.scopeNodeId,
      period: input.period,
      asOf: input.asOf,
      limit: 1,
    });

    return row ? toView(row) : null;
  }

  /**
   * Effective measurements matching the supplied filters, one per
   * KPI/scope/period series.
   */
  async list(input: ListMeasurementsInput): Promise<MeasurementView[]> {
    const rows = await this.queryEffective(this.prisma, input);
    return rows.map(toView);
  }

  private async queryEffective(
    client: Pick<Prisma.TransactionClient, "$queryRawUnsafe">,
    input: ListMeasurementsInput,
  ): Promise<MeasurementRow[]> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];

    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (input.kpiVersionId !== undefined) {
      conditions.push(`m.kpi_version_id = ${bind(input.kpiVersionId)}`);
    }

    if (input.scopeNodeId !== undefined) {
      conditions.push(`m.scope_node_id = ${bind(input.scopeNodeId)}`);
    }

    if (input.period !== undefined) {
      conditions.push(`m.period = ${bind(input.period)}`);
    }

    // The supersession predicate is what makes this point-in-time correct: a
    // superseding row only counts once it exists.
    let supersededPredicate = `
      NOT EXISTS (
        SELECT 1
        FROM performance.measurements s
        WHERE s.supersedes_id = m.id
      )`;

    if (input.asOf !== undefined) {
      const asOfParameter = bind(input.asOf);
      conditions.push(`m.created_at <= ${asOfParameter}`);
      supersededPredicate = `
      NOT EXISTS (
        SELECT 1
        FROM performance.measurements s
        WHERE s.supersedes_id = m.id
          AND s.created_at <= ${asOfParameter}
      )`;
    }

    conditions.push(supersededPredicate);

    const sql = `
      SELECT ${SELECTED_COLUMNS}
      FROM performance.measurements m
      WHERE ${conditions.join("\n        AND ")}
      ORDER BY
        m.kpi_version_id ASC,
        m.scope_node_id ASC,
        m.period ASC,
        m.created_at DESC,
        m.id DESC
      LIMIT ${bind(input.limit)}
    `;

    return client.$queryRawUnsafe<MeasurementRow[]>(sql, ...parameters);
  }

  /**
   * The full correction chain a measurement belongs to, oldest first. Walks
   * both directions so any member of the chain yields the whole of it.
   */
  async chainFor(measurementId: string): Promise<MeasurementView[]> {
    const rows = await this.prisma.$queryRawUnsafe<MeasurementRow[]>(
      `
      WITH RECURSIVE ancestors AS (
        SELECT * FROM performance.measurements WHERE id = $1
        UNION
        SELECT p.* FROM performance.measurements p
        JOIN ancestors a ON a.supersedes_id = p.id
      ),
      descendants AS (
        SELECT * FROM performance.measurements WHERE id = $1
        UNION
        SELECT c.* FROM performance.measurements c
        JOIN descendants d ON c.supersedes_id = d.id
      )
      SELECT ${SELECTED_COLUMNS}
      FROM (
        SELECT * FROM ancestors
        UNION
        SELECT * FROM descendants
      ) m
      ORDER BY m.created_at ASC, m.id ASC
      `,
      measurementId,
    );

    if (rows.length === 0) {
      throw performanceErrors.measurementNotFound();
    }

    return rows.map(toView);
  }

  /**
   * Marks a measurement as unique-constraint-safe for callers that replay.
   * Exposed so the capture and feed paths share one interpretation of a
   * duplicate insert.
   */
  static isDuplicate(error: unknown): boolean {
    return isUniqueConstraintViolation(error);
  }
}
