import type { Prisma } from "../../generated/prisma/client";
import { MeasurementSource as PrismaMeasurementSource } from "../../generated/prisma/client";
import type { PrismaService } from "../../database/prisma.service";
import { EventBusService } from "../../events/event-bus.service";
import {
  CaptureSessionError,
  FeedLockError,
  MeasurementImmutabilityError,
  PerformanceOperationError,
} from "./performance.errors";
import type {
  CommentaryInput,
  CommentaryView,
  CreateMeasurementInput,
  CreateTargetSeriesInput,
  MeasurementListOptions,
  MeasurementView,
  RecallCaptureSessionInput,
  StartCaptureSessionInput,
  StatusResultView,
  SubmitCaptureSessionInput,
  TargetSeriesView,
} from "./performance.types";

export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventBus: EventBusService,
  ) {}

  async createMeasurement(
    input: CreateMeasurementInput,
  ): Promise<MeasurementView> {
    // Feed-lock enforcement: reject manual overwrite of locked feed measurements
    const sourceInputLower = input.source.toLowerCase();
    if (sourceInputLower === "manual" && input.supersedesId) {
      const superseded = await this.prisma.measurement.findUnique({
        where: { id: input.supersedesId },
      });

      if (superseded && superseded.source.toLowerCase() === "feed" && superseded.locked) {
        throw new FeedLockError(
          "Cannot overwrite a locked feed measurement manually",
        );
      }
    }

    // Convert lowercase API source to Prisma enum (e.g. "manual" → "MANUAL")
    const prismaSource =
      PrismaMeasurementSource[input.source.toUpperCase() as keyof typeof PrismaMeasurementSource];

    const measurement = await this.prisma.$transaction(async (tx) => {
      const newMeasurement = await tx.measurement.create({
        data: {
          kpiVersionId: input.kpiVersionId,
          scopeNodeId: input.scopeNodeId,
          period: input.period,
          value: input.value,
          source: prismaSource,
          locked: input.locked ?? false,
          supersedesId: input.supersedesId,
          submittedBy: input.submittedBy,
          evidenceRef: input.evidenceRef,
        },
      });

      // Emit measurement recorded event
      await this.eventBus.publishWithin(
        tx,
        [
          {
            eventType: "performance.measurement.recorded",
            eventVersion: 1,
            aggregateType: "measurement",
            aggregateId: newMeasurement.id,
            dedupeKey: `measurement:${newMeasurement.id}`,
            payload: {
              measurementId: newMeasurement.id,
              kpiVersionId: newMeasurement.kpiVersionId,
              scopeNodeId: newMeasurement.scopeNodeId,
              period: newMeasurement.period,
              value: typeof newMeasurement.value === "number" ? newMeasurement.value : newMeasurement.value.toNumber(),
              source: newMeasurement.source,
              supersedesId: newMeasurement.supersedesId,
            },
          },
        ],
      );

      return newMeasurement;
    });

    return this.toMeasurementView(measurement);
  }

  async listMeasurements(
    options: MeasurementListOptions = {},
  ): Promise<MeasurementView[]> {
    const where: Prisma.MeasurementWhereInput = {};

    if (options.kpiVersionId) {
      where.kpiVersionId = options.kpiVersionId;
    }

    if (options.scopeNodeId) {
      where.scopeNodeId = options.scopeNodeId;
    }

    if (options.period) {
      where.period = options.period;
    }

    // Point-in-time "asOf" resolution
    if (options.asOf) {
      where.createdAt = { lte: options.asOf };
    }

    // If not including superseded, only return the latest measurement in a chain.
    // supersededBy is a nullable one-to-one relation: `is: null` means "nothing
    // has superseded this measurement" (i.e. it is the current head).
    if (!options.includeSuperseded) {
      where.supersededBy = { is: null };
    }

    const measurements = await this.prisma.measurement.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return measurements.map((m) => this.toMeasurementView(m));
  }

  async getCurrentMeasurement(
    kpiVersionId: string,
    scopeNodeId: string,
    period: string,
  ): Promise<MeasurementView | null> {
    // Find the latest measurement in the supersession chain
    const measurement = await this.prisma.measurement.findFirst({
      where: {
        kpiVersionId,
        scopeNodeId,
        period,
        // supersededBy is a nullable scalar relation; `is: null` means
        // no other measurement has superseded this one yet.
        supersededBy: { is: null },
      },
      orderBy: { createdAt: "desc" },
    });

    return measurement ? this.toMeasurementView(measurement) : null;
  }

  async getMeasurementAsOf(
    kpiVersionId: string,
    scopeNodeId: string,
    period: string,
    asOf: Date,
  ): Promise<MeasurementView | null> {
    // Reconstruct what the measurement was at a point in time
    const measurement = await this.prisma.measurement.findFirst({
      where: {
        kpiVersionId,
        scopeNodeId,
        period,
        createdAt: { lte: asOf },
        // As-of point-in-time: find the head of the chain at `asOf`.
        // supersededBy is a nullable scalar relation so we can't filter
        // by the superseding row's createdAt here — we get all candidates
        // created before `asOf` and take the latest one.
        supersededBy: { is: null },
      },
      orderBy: { createdAt: "desc" },
    });

    return measurement ? this.toMeasurementView(measurement) : null;
  }

  async createTargetSeries(
    input: CreateTargetSeriesInput,
  ): Promise<TargetSeriesView> {
    const targetSeries = await this.prisma.targetSeries.create({
      data: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
        targetValue: input.targetValue,
        planVersionId: input.planVersionId,
      },
    });

    return this.toTargetSeriesView(targetSeries);
  }

  async addTargetSeries(
    input: CreateTargetSeriesInput,
  ): Promise<TargetSeriesView> {
    return this.createTargetSeries(input);
  }

  async addCommentary(input: CommentaryInput): Promise<CommentaryView> {
    const commentary = await this.prisma.commentary.create({
      data: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
        authorId: input.authorId,
        bodyEn: input.bodyEn ?? null,
        bodyAr: input.bodyAr ?? null,
      },
    });

    return this.toCommentaryView(commentary);
  }

  async startCaptureSession(
    input: StartCaptureSessionInput,
  ): Promise<{ sessionId: string }> {
    // Check if a session already exists
    const existing = await this.prisma.captureSession.findUnique({
      where: {
        kpiVersionId_scopeNodeId_period: {
          kpiVersionId: input.kpiVersionId,
          scopeNodeId: input.scopeNodeId,
          period: input.period,
        },
      },
    });

    if (existing) {
      if (existing.state.toLowerCase() === "submitted") {
        throw new CaptureSessionError(
          "A submitted session already exists for this period. Recall it first.",
        );
      }
      // Return existing draft or recalled session
      return { sessionId: existing.id };
    }

    const session = await this.prisma.captureSession.create({
      data: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
        state: "draft" as any,
        ownerId: input.ownerId,
      },
    });

    return { sessionId: session.id };
  }

  async submitCaptureSession(
    input: SubmitCaptureSessionInput,
  ): Promise<MeasurementView> {
    const session = await this.prisma.captureSession.findUnique({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new CaptureSessionError("Capture session not found");
    }

    if (session.state.toLowerCase() !== "draft") {
      throw new CaptureSessionError(
        `Cannot submit a session in state: ${session.state}`,
      );
    }

    // Get current measurement to supersede if exists
    const currentMeasurement = await this.getCurrentMeasurement(
      session.kpiVersionId,
      session.scopeNodeId,
      session.period,
    );

    return this.prisma.$transaction(async (tx) => {
      // Create new measurement
      const newMeasurement = await this.createMeasurement(
        {
          kpiVersionId: session.kpiVersionId,
          scopeNodeId: session.scopeNodeId,
          period: session.period,
          value: input.measurementValue,
          source: "manual",
          locked: true, // Lock submitted measurements
          supersedesId: currentMeasurement?.id ?? null,
          submittedBy: session.ownerId,
          evidenceRef: input.evidenceRef,
        },
      );

      // Update session state
      await tx.captureSession.update({
        where: { id: input.sessionId },
        data: { state: "submitted" as any },
      });

      return newMeasurement;
    });
  }

  async recallCaptureSession(
    input: RecallCaptureSessionInput,
  ): Promise<void> {
    const session = await this.prisma.captureSession.findUnique({
      where: { id: input.sessionId },
    });

    if (!session) {
      throw new CaptureSessionError("Capture session not found");
    }

    if (session.state.toLowerCase() !== "submitted") {
      throw new CaptureSessionError(
        `Cannot recall a session in state: ${session.state}`,
      );
    }

    // Cutoff rule for recall:
    // A capture session can only be recalled if it is in 'submitted' state
    // and before any downstream approval or consumption has occurred (e.g. publication or workflow signoff).
    // Workflow module (Prompt 1.5) integration will evaluate approval case state here.

    await this.prisma.captureSession.update({
      where: { id: input.sessionId },
      data: { state: "recalled" as any },
    });
  }

  async getStatusResult(
    kpiVersionId: string,
    scopeNodeId: string,
    period: string,
  ): Promise<StatusResultView | null> {
    const statusResult = await this.prisma.statusResult.findUnique({
      where: {
        kpiVersionId_scopeNodeId_period: {
          kpiVersionId,
          scopeNodeId,
          period,
        },
      },
    });

    if (!statusResult) {
      return null;
    }

    return {
      id: statusResult.id,
      kpiVersionId: statusResult.kpiVersionId,
      scopeNodeId: statusResult.scopeNodeId,
      period: statusResult.period,
      status: statusResult.status,
      computedAt: statusResult.computedAt,
      ruleVersionUsed: statusResult.ruleVersionUsed,
      createdAt: statusResult.createdAt,
    };
  }

  async getRollupResult(
    parentKpiId: string,
    scopeNodeId: string,
    period: string,
  ): Promise<any | null> {
    const rollupResult = await this.prisma.rollupResult.findUnique({
      where: {
        parentKpiId_scopeNodeId_period: {
          parentKpiId,
          scopeNodeId,
          period,
        },
      },
    });

    if (!rollupResult) {
      return null;
    }

    return {
      id: rollupResult.id,
      parentKpiId: rollupResult.parentKpiId,
      scopeNodeId: rollupResult.scopeNodeId,
      period: rollupResult.period,
      aggregatedValue: rollupResult.aggregatedValue.toNumber(),
      method: rollupResult.method,
      createdAt: rollupResult.createdAt,
    };
  }

  private toMeasurementView(
    measurement: any,
  ): MeasurementView {
    return {
      id: measurement.id,
      kpiVersionId: measurement.kpiVersionId,
      scopeNodeId: measurement.scopeNodeId,
      period: measurement.period,
      value: typeof measurement.value === "number" ? measurement.value : measurement.value.toNumber(),
      source: (measurement.source as string).toLowerCase() as MeasurementView["source"],
      locked: measurement.locked,
      supersedesId: measurement.supersedesId,
      submittedBy: measurement.submittedBy,
      evidenceRef: measurement.evidenceRef,
      createdAt: measurement.createdAt,
    };
  }

  private toTargetSeriesView(
    targetSeries: any,
  ): TargetSeriesView {
    return {
      id: targetSeries.id,
      kpiVersionId: targetSeries.kpiVersionId,
      scopeNodeId: targetSeries.scopeNodeId,
      period: targetSeries.period,
      targetValue: typeof targetSeries.targetValue === "number" ? targetSeries.targetValue : targetSeries.targetValue.toNumber(),
      planVersionId: targetSeries.planVersionId,
      createdAt: targetSeries.createdAt,
      updatedAt: targetSeries.updatedAt,
    };
  }

  private toCommentaryView(
    commentary: any,
  ): CommentaryView {
    return {
      id: commentary.id,
      kpiVersionId: commentary.kpiVersionId,
      scopeNodeId: commentary.scopeNodeId,
      period: commentary.period,
      authorId: commentary.authorId,
      bodyEn: commentary.bodyEn,
      bodyAr: commentary.bodyAr,
      createdAt: commentary.createdAt,
    };
  }
}
