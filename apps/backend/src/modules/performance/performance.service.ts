import type { CaptureSessionService } from "./capture-session.service";
import type { CommentaryService } from "./commentary.service";
import type { MeasurementService } from "./measurement.service";
import type { PerformanceResultsService } from "./performance-results.service";

/**
 * Single entry point the tRPC layer depends on, so the router stays a thin
 * adapter and the context grows one key rather than five. Each method delegates
 * to the service that owns the rule; no behaviour lives here.
 */
export class PerformanceService {
  constructor(
    private readonly captureSessions: CaptureSessionService,
    private readonly measurements: MeasurementService,
    private readonly commentary: CommentaryService,
    private readonly results: PerformanceResultsService,
  ) {}

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
}
