import type { CaptureSessionService } from "./capture-session.service";
import type { CaptureWorkspaceService } from "./capture-workspace.service";
import type { CommentaryService } from "./commentary.service";
import type { MeasurementService } from "./measurement.service";
import type { PerformanceResultsService } from "./performance-results.service";
import type { KpiDetailService } from "./kpi-detail.service";

/**
 * Single entry point the tRPC layer depends on, so the router stays a thin
 * adapter and the context grows one key rather than five. Each method delegates
 * to the service that owns the rule; no behaviour lives here.
 */
export class PerformanceService {
  constructor(
    private readonly captureSessions: CaptureSessionService,
    private readonly workspace: CaptureWorkspaceService,
    private readonly measurements: MeasurementService,
    private readonly commentary: CommentaryService,
    private readonly results: PerformanceResultsService,
    private readonly kpiDetail: KpiDetailService,
  ) {}

  listCaptureTasks = (ownerId: string) => this.workspace.listTasks(ownerId);
  getCaptureSession = (sessionId: string) => this.workspace.getSession(sessionId);
  saveCaptureDraft = (sessionId: string, ownerId: string, value: number, evidenceRef?: string | null) => this.workspace.saveDraft(sessionId, ownerId, value, evidenceRef);
  captureHistory = (kpiVersionId: string, scopeNodeId: string) => this.workspace.history(kpiVersionId, scopeNodeId);
  captureTemplate = (format: "csv" | "xlsx", period: string, priorValue: number | null) => this.workspace.template(format, period, priorValue);
  validateCaptureTemplate = (bytes: Buffer, format: "csv" | "xlsx", expectedPeriod: string, history: number[], sessionId?: string, ownerId?: string) => this.workspace.validateTemplate(bytes, format, expectedPeriod, history, sessionId, ownerId);
  uploadCaptureEvidence = (sessionId: string, fileName: string, contentType: string, bytes: Buffer) => this.workspace.uploadEvidence(sessionId, fileName, contentType, bytes);

  startCaptureSession: CaptureSessionService["startSession"] = (input) =>
    this.captureSessions.startSession(input);

  submitCaptureSession: CaptureSessionService["submit"] = (input) =>
    this.captureSessions.submit(input);

  recallCaptureSession: CaptureSessionService["recall"] = (input) =>
    this.captureSessions.recall(input);

  listMeasurements: MeasurementService["list"] = (input) =>
    this.measurements.list(input);

  addCommentary: CommentaryService["add"] = (input) =>
    this.commentary.add(input);

  getStatus: PerformanceResultsService["getStatus"] = (input) =>
    this.results.getStatus(input);

  getRollup: PerformanceResultsService["getRollup"] = (input) =>
    this.results.getRollup(input);

  getKpiDetail: KpiDetailService["get"] = (kpiDefinitionId) =>
    this.kpiDetail.get(kpiDefinitionId);

  listCommentary: CommentaryService["list"] = (input) =>
    this.commentary.list(input);
}
