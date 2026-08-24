import type {
  PixelRagAlert,
  PixelRagAuditEvent,
  PixelRagConnectorCatalog,
  PixelRagDataCaptureProposal,
  PixelRagDocumentLibraryState,
  PixelRagDocumentRecord,
  PixelRagEvidenceImage,
  PixelRagForecastResult,
  PixelRagGovernanceSettings,
  PixelRagHealth,
  PixelRagIngestionScanResult,
  PixelRagIngestionSettings,
  PixelRagIntelligenceKind,
  PixelRagIntelligenceResult,
  PixelRagLineageResult,
  PixelRagMultiDocumentQaResult,
  PixelRagQaResult,
  PixelRagReanalysisResult,
  PixelRagSmartImportProposal,
  PixelRagWorkflowJob,
} from "./pixelrag.types";

export class PixelRagClientError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "PixelRagClientError";
    this.status = status;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

function errorDetail(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "detail" in payload &&
    typeof (payload as { detail?: unknown }).detail === "string"
  ) {
    return (payload as { detail: string }).detail;
  }

  return typeof payload === "string" && payload.trim() ? payload.trim() : null;
}

/** HTTP boundary around the independently deployed Python PixelRAG service. */
export class PixelRagClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly serviceToken?: string;

  constructor(baseUrl: string, timeoutMs = 300_000, serviceToken?: string) {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (!normalized) {
      throw new PixelRagClientError("PixelRAG base URL is required");
    }

    this.baseUrl = normalized;
    this.timeoutMs = timeoutMs;
    this.serviceToken = serviceToken?.trim() || undefined;
  }

  private headers(extra?: Record<string, string>): Headers {
    const headers = new Headers(extra);
    headers.set("Accept", "application/json");
    if (this.serviceToken) {
      headers.set("Authorization", `Bearer ${this.serviceToken}`);
    }
    return headers;
  }

  private async fetchResponse(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        let payload: unknown = text;
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            // Keep the original response text.
          }
        }
        throw new PixelRagClientError(
          errorDetail(payload) ?? `PixelRAG request failed with status ${response.status}`,
          response.status,
        );
      }

      return response;
    } catch (error) {
      if (error instanceof PixelRagClientError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new PixelRagClientError("PixelRAG request timed out");
      }
      throw new PixelRagClientError("PixelRAG service is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers = this.headers(options.headers);
    let body: string | undefined;
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await this.fetchResponse(path, {
      method: options.method ?? "GET",
      headers,
      body,
    });
    return (await response.json()) as T;
  }

  private actorHeaders(input?: { actor?: string; role?: string }): Record<string, string> | undefined {
    const headers: Record<string, string> = {};
    if (input?.actor) headers["X-User-Name"] = input.actor;
    if (input?.role) headers["X-User-Role"] = input.role;
    return Object.keys(headers).length ? headers : undefined;
  }

  health(): Promise<PixelRagHealth> {
    return this.request<PixelRagHealth>("/api/health");
  }

  listDocuments(): Promise<PixelRagDocumentLibraryState> {
    return this.request<PixelRagDocumentLibraryState>("/api/documents");
  }

  async uploadDocument(input: {
    filename: string;
    contentType?: string;
    dataBase64: string;
    actor?: string;
    role?: string;
  }): Promise<PixelRagDocumentRecord> {
    const bytes = Buffer.from(input.dataBase64, "base64");
    const form = new FormData();
    form.set(
      "file",
      new Blob([bytes], { type: input.contentType || "application/octet-stream" }),
      input.filename,
    );
    const response = await this.fetchResponse("/api/documents/upload", {
      method: "POST",
      headers: this.headers(this.actorHeaders(input)),
      body: form,
    });
    return (await response.json()) as PixelRagDocumentRecord;
  }

  selectDocument(documentId: string): Promise<PixelRagDocumentRecord> {
    return this.request<PixelRagDocumentRecord>(
      `/api/documents/${encodeURIComponent(documentId)}/select`,
      { method: "POST" },
    );
  }

  deleteDocument(documentId: string, actor?: string): Promise<PixelRagDocumentRecord> {
    return this.request<PixelRagDocumentRecord>(
      `/api/documents/${encodeURIComponent(documentId)}`,
      {
        method: "DELETE",
        headers: this.actorHeaders(actor ? { actor } : undefined),
      },
    );
  }

  reindexDocument(documentId: string): Promise<PixelRagDocumentRecord> {
    return this.request<PixelRagDocumentRecord>(
      `/api/documents/${encodeURIComponent(documentId)}/reindex`,
      { method: "POST" },
    );
  }

  reanalyzeDocument(documentId: string): Promise<PixelRagReanalysisResult> {
    return this.request<PixelRagReanalysisResult>(
      `/api/documents/${encodeURIComponent(documentId)}/reanalyze`,
      { method: "POST" },
    );
  }

  ask(input: { question: string; topK?: number; role?: string }): Promise<PixelRagQaResult> {
    return this.request<PixelRagQaResult>("/api/qa", {
      method: "POST",
      body: { question: input.question, top_k: input.topK ?? 3 },
      headers: input.role ? { "X-User-Role": input.role } : undefined,
    });
  }

  askAcrossDocuments(input: {
    question: string;
    documentIds: string[];
    topKPerDocument?: number;
  }): Promise<PixelRagMultiDocumentQaResult> {
    return this.request<PixelRagMultiDocumentQaResult>("/api/qa/multi", {
      method: "POST",
      body: {
        question: input.question,
        document_ids: input.documentIds,
        top_k_per_document: input.topKPerDocument ?? 3,
      },
    });
  }

  askAcrossDocumentsVisual(input: {
    question: string;
    documentIds: string[];
    topKPerDocument?: number;
    actor?: string;
    role?: string;
  }): Promise<unknown> {
    return this.request<unknown>("/api/qa/multi-visual", {
      method: "POST",
      body: {
        question: input.question,
        document_ids: input.documentIds,
        top_k_per_document: input.topKPerDocument ?? 3,
      },
      headers: this.actorHeaders(input),
    });
  }

  async evidenceImage(input: {
    documentId: string;
    articleId: number;
    tileIndex: number;
    chunkIndex: number;
  }): Promise<PixelRagEvidenceImage> {
    const response = await this.fetchResponse(
      `/api/documents/${encodeURIComponent(input.documentId)}/evidence/${input.articleId}/${input.tileIndex}/${input.chunkIndex}`,
      { method: "GET", headers: this.headers() },
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      mediaType: response.headers.get("content-type") || "image/jpeg",
      dataBase64: buffer.toString("base64"),
    };
  }

  previewSmartImport(input?: { actor?: string; role?: string }): Promise<PixelRagSmartImportProposal> {
    return this.request<PixelRagSmartImportProposal>("/api/smart-import/preview", {
      method: "POST",
      headers: this.actorHeaders(input),
    });
  }

  previewDataCapture(input?: { actor?: string; role?: string }): Promise<PixelRagDataCaptureProposal> {
    return this.request<PixelRagDataCaptureProposal>("/api/data-capture/preview", {
      method: "POST",
      headers: this.actorHeaders(input),
    });
  }

  intelligence(input: {
    kind: PixelRagIntelligenceKind;
    subject?: string;
    role?: string;
  }): Promise<PixelRagIntelligenceResult> {
    return this.request<PixelRagIntelligenceResult>("/api/intelligence", {
      method: "POST",
      body: { kind: input.kind, subject: input.subject ?? null },
      headers: input.role ? { "X-User-Role": input.role } : undefined,
    });
  }

  forecast(kpiName: string): Promise<PixelRagForecastResult> {
    return this.request<PixelRagForecastResult>(`/api/forecast/${encodeURIComponent(kpiName)}`);
  }

  lineage(kpiName: string): Promise<PixelRagLineageResult> {
    return this.request<PixelRagLineageResult>(`/api/lineage/kpi/${encodeURIComponent(kpiName)}`);
  }

  alerts(): Promise<PixelRagAlert[]> {
    return this.request<PixelRagAlert[]>("/api/alerts");
  }

  acknowledgeAlert(alertId: string): Promise<PixelRagAlert> {
    return this.request<PixelRagAlert>(`/api/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
      method: "POST",
    });
  }

  governance(): Promise<PixelRagGovernanceSettings> {
    return this.request<PixelRagGovernanceSettings>("/api/governance");
  }

  updateGovernance(settings: PixelRagGovernanceSettings, role = "admin"): Promise<PixelRagGovernanceSettings> {
    return this.request<PixelRagGovernanceSettings>("/api/governance", {
      method: "PUT",
      body: settings,
      headers: { "X-User-Role": role },
    });
  }

  audit(limit = 100): Promise<PixelRagAuditEvent[]> {
    return this.request<PixelRagAuditEvent[]>(`/api/audit?limit=${encodeURIComponent(String(limit))}`);
  }

  workflows(limit = 100): Promise<PixelRagWorkflowJob[]> {
    return this.request<PixelRagWorkflowJob[]>(`/api/workflows?limit=${encodeURIComponent(String(limit))}`);
  }

  ingestionSettings(): Promise<PixelRagIngestionSettings> {
    return this.request<PixelRagIngestionSettings>("/api/ingestion/settings");
  }

  updateIngestionSettings(settings: PixelRagIngestionSettings): Promise<PixelRagIngestionSettings> {
    return this.request<PixelRagIngestionSettings>("/api/ingestion/settings", {
      method: "PUT",
      body: settings,
    });
  }

  scanIngestion(): Promise<PixelRagIngestionScanResult> {
    return this.request<PixelRagIngestionScanResult>("/api/ingestion/scan", { method: "POST" });
  }

  connectors(): Promise<PixelRagConnectorCatalog> {
    return this.request<PixelRagConnectorCatalog>("/api/connectors");
  }
}
