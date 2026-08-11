import type { PrismaService } from "../../database/prisma.service";
import type { Logger } from "../../logging/logger";
import { performanceErrors } from "./performance.errors";
import type {
  MeasurementService,
  MeasurementView,
} from "./measurement.service";

export type CaptureSessionStateValue = "DRAFT" | "SUBMITTED" | "RECALLED";

export interface CaptureSessionView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  state: CaptureSessionStateValue;
  ownerId: string;
  submittedMeasurementId: string | null;
  submittedAt: Date | null;
  recalledAt: Date | null;
  recallDeadlineAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface StartSessionInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  ownerId: string;
  /**
   * Optional hard recall cutoff, normally the close of the capture window that
   * this session belongs to.
   */
  recallDeadlineAt?: Date | null;
}

export interface SubmitSessionInput {
  sessionId: string;
  actorId: string;
  value: number;
  evidenceRef?: string | null;
}

export interface RecallSessionInput {
  sessionId: string;
  actorId: string;
  /** Data stewards may recall a submission they do not own. */
  actorIsDataSteward: boolean;
}

export interface SubmitSessionResult {
  session: CaptureSessionView;
  measurement: MeasurementView;
}

interface CaptureSessionRecord {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  state: CaptureSessionStateValue;
  ownerId: string;
  submittedMeasurementId: string | null;
  submittedAt: Date | null;
  recalledAt: Date | null;
  recallDeadlineAt: Date | null;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function toView(record: CaptureSessionRecord): CaptureSessionView {
  return {
    id: record.id,
    kpiVersionId: record.kpiVersionId,
    scopeNodeId: record.scopeNodeId,
    period: record.period,
    state: record.state,
    ownerId: record.ownerId,
    submittedMeasurementId: record.submittedMeasurementId,
    submittedAt: record.submittedAt,
    recalledAt: record.recalledAt,
    recallDeadlineAt: record.recallDeadlineAt,
    consumedAt: record.consumedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Capture session lifecycle.
 *
 *   DRAFT ──submit──▶ SUBMITTED ──recall──▶ RECALLED ──startSession──▶ DRAFT
 *
 * Every other transition is rejected:
 *
 *   DRAFT     -> RECALLED   nothing has been submitted yet
 *   SUBMITTED -> SUBMITTED  a submitted period is locked against further edits
 *   RECALLED  -> SUBMITTED  a recalled session must be reopened as a draft
 *                           first, so the editable state is always explicit
 *
 * ## Recall cutoff
 *
 * There is no workflow or approval module in this repository yet, so recall
 * cannot be gated on an approval decision. The narrowest explicit cutoff is
 * used instead, and it has two independent arms:
 *
 *  1. `consumedAt` — set by `markConsumed`, the hook a downstream consumer
 *     calls when it takes the submission. Once set, recall is refused
 *     permanently. Phase 3 approval infrastructure calls this rather than
 *     introducing a competing concept.
 *  2. `recallDeadlineAt` — an optional instant captured when the session
 *     starts, normally the close of the capture window. Past it, recall is
 *     refused.
 *
 * A session with neither set stays recallable, which is the correct default
 * while no downstream consumer exists.
 *
 * Recall never rewrites the submitted measurement: measurements are immutable.
 * It reopens the session so the next submission inserts a correction that
 * supersedes the earlier row.
 */
export class CaptureSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly measurements: MeasurementService,
    private readonly logger: Logger,
  ) {}

  /**
   * Opens a draft session, or reopens the recalled session for the same
   * KPI/scope/period.
   */
  async startSession(
    input: StartSessionInput,
  ): Promise<CaptureSessionView> {
    const existing = await this.prisma.captureSession.findFirst({
      where: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existing?.state === "DRAFT" || existing?.state === "SUBMITTED") {
      throw performanceErrors.duplicateActiveSession();
    }

    if (existing?.state === "RECALLED") {
      const reopened = await this.prisma.captureSession.update({
        where: { id: existing.id },
        data: {
          state: "DRAFT",
          ...(input.recallDeadlineAt === undefined
            ? {}
            : { recallDeadlineAt: input.recallDeadlineAt }),
        },
      });

      this.logger.debug("Capture session reopened", {
        sessionId: reopened.id,
        kpiVersionId: reopened.kpiVersionId,
        scopeNodeId: reopened.scopeNodeId,
        period: reopened.period,
      });

      return toView(reopened);
    }

    const created = await this.prisma.captureSession.create({
      data: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
        ownerId: input.ownerId,
        state: "DRAFT",
        recallDeadlineAt: input.recallDeadlineAt ?? null,
      },
    });

    this.logger.debug("Capture session started", {
      sessionId: created.id,
      kpiVersionId: created.kpiVersionId,
      scopeNodeId: created.scopeNodeId,
      period: created.period,
    });

    return toView(created);
  }

  /**
   * Submits the draft. The measurement is appended: a first value when the
   * series is empty, otherwise a correction that supersedes the currently
   * effective measurement.
   */
  async submit(input: SubmitSessionInput): Promise<SubmitSessionResult> {
    const session = await this.requireSession(input.sessionId);

    if (session.state !== "DRAFT") {
      throw performanceErrors.invalidCaptureTransition(
        session.state.toLowerCase(),
        "submitted",
      );
    }

    const current = await this.measurements.resolveCurrent({
      kpiVersionId: session.kpiVersionId,
      scopeNodeId: session.scopeNodeId,
      period: session.period,
    });

    // Feed-lock and invalid-supersession rejections surface from here, before
    // the session state is touched, so a rejected submit leaves the session in
    // DRAFT and inserts no row.
    const measurement = await this.measurements.record({
      kpiVersionId: session.kpiVersionId,
      scopeNodeId: session.scopeNodeId,
      period: session.period,
      value: input.value,
      source: "MANUAL",
      supersedesId: current?.id ?? null,
      submittedBy: input.actorId,
      evidenceRef: input.evidenceRef ?? null,
    });

    const submitted = await this.prisma.captureSession.update({
      where: { id: session.id },
      data: {
        state: "SUBMITTED",
        submittedAt: new Date(),
        submittedMeasurementId: measurement.id,
      },
    });

    this.logger.info("Capture session submitted", {
      sessionId: submitted.id,
      kpiVersionId: submitted.kpiVersionId,
      scopeNodeId: submitted.scopeNodeId,
      period: submitted.period,
      measurementId: measurement.id,
      supersedesId: measurement.supersedesId,
    });

    return {
      session: toView(submitted),
      measurement,
    };
  }

  /** Recalls a submission that has not passed its cutoff. */
  async recall(input: RecallSessionInput): Promise<CaptureSessionView> {
    const session = await this.requireSession(input.sessionId);

    if (session.state !== "SUBMITTED") {
      throw performanceErrors.invalidCaptureTransition(
        session.state.toLowerCase(),
        "recalled",
      );
    }

    if (
      session.ownerId !== input.actorId &&
      !input.actorIsDataSteward
    ) {
      throw performanceErrors.recallNotPermitted();
    }

    if (session.consumedAt !== null) {
      throw performanceErrors.recallCutoffReached("consumed");
    }

    if (
      session.recallDeadlineAt !== null &&
      session.recallDeadlineAt.getTime() < Date.now()
    ) {
      throw performanceErrors.recallCutoffReached("deadline");
    }

    const recalled = await this.prisma.captureSession.update({
      where: { id: session.id },
      data: {
        state: "RECALLED",
        recalledAt: new Date(),
      },
    });

    this.logger.info("Capture session recalled", {
      sessionId: recalled.id,
      kpiVersionId: recalled.kpiVersionId,
      scopeNodeId: recalled.scopeNodeId,
      period: recalled.period,
      actorId: input.actorId,
    });

    return toView(recalled);
  }

  /**
   * Downstream consumption signal — the hard recall cutoff. Kept deliberately
   * small so the future approval module can drive it without Performance
   * growing an approval concept of its own.
   */
  async markConsumed(sessionId: string): Promise<CaptureSessionView> {
    const session = await this.requireSession(sessionId);

    if (session.consumedAt !== null) {
      return toView(session);
    }

    const consumed = await this.prisma.captureSession.update({
      where: { id: session.id },
      data: { consumedAt: new Date() },
    });

    return toView(consumed);
  }

  async get(sessionId: string): Promise<CaptureSessionView> {
    return toView(await this.requireSession(sessionId));
  }

  private async requireSession(
    sessionId: string,
  ): Promise<CaptureSessionRecord> {
    const session = await this.prisma.captureSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw performanceErrors.captureSessionNotFound();
    }

    return session;
  }
}
