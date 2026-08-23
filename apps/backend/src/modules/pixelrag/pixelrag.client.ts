import type {
  PixelRagDataCaptureProposal,
  PixelRagDocumentLibraryState,
  PixelRagDocumentRecord,
  PixelRagHealth,
  PixelRagIntelligenceKind,
  PixelRagIntelligenceResult,
  PixelRagMultiDocumentQaResult,
  PixelRagQaResult,
  PixelRagSmartImportProposal,
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
  method?: "GET" | "POST";
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

  return typeof payload === "string" && payload.trim()
    ? payload.trim()
    : null;
}

/**
 * Small HTTP boundary around the independently deployed Python PixelRAG service.
 *
 * This class knows nothing about Prisma, StratAlign repositories, governance
 * writes, or existing business services. It only speaks the PixelRAG HTTP API.
 */
export class PixelRagClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(baseUrl: string, timeoutMs = 300_000) {
    const normalized = baseUrl.trim().replace(/\/+$/, "");

    if (!normalized) {
      throw new PixelRagClientError("PixelRAG base URL is required");
    }

    this.baseUrl = normalized;
    this.timeoutMs = timeoutMs;
  }

  private async request<T>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const headers = new Headers(options.headers);
      headers.set("Accept", "application/json");

      let body: string | undefined;

      if (options.body !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(options.body);
      }

      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body,
        signal: controller.signal,
      });

      const text = await response.text();
      let payload: unknown = null;

      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = text;
        }
      }

      if (!response.ok) {
        throw new PixelRagClientError(
          errorDetail(payload) ??
            `PixelRAG request failed with status ${response.status}`,
          response.status,
        );
      }

      return payload as T;
    } catch (error) {
      if (error instanceof PixelRagClientError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new PixelRagClientError("PixelRAG request timed out");
      }

      throw new PixelRagClientError("PixelRAG service is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  health(): Promise<PixelRagHealth> {
    return this.request<PixelRagHealth>("/api/health");
  }

  listDocuments(): Promise<PixelRagDocumentLibraryState> {
    return this.request<PixelRagDocumentLibraryState>("/api/documents");
  }

  selectDocument(documentId: string): Promise<PixelRagDocumentRecord> {
    return this.request<PixelRagDocumentRecord>(
      `/api/documents/${encodeURIComponent(documentId)}/select`,
      { method: "POST" },
    );
  }

  ask(input: {
    question: string;
    topK?: number;
    role?: string;
  }): Promise<PixelRagQaResult> {
    return this.request<PixelRagQaResult>("/api/qa", {
      method: "POST",
      body: {
        question: input.question,
        top_k: input.topK ?? 3,
      },
      headers: input.role
        ? { "X-User-Role": input.role }
        : undefined,
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

  previewSmartImport(input?: {
    actor?: string;
    role?: string;
  }): Promise<PixelRagSmartImportProposal> {
    return this.request<PixelRagSmartImportProposal>(
      "/api/smart-import/preview",
      {
        method: "POST",
        headers: this.actorHeaders(input),
      },
    );
  }

  previewDataCapture(input?: {
    actor?: string;
    role?: string;
  }): Promise<PixelRagDataCaptureProposal> {
    return this.request<PixelRagDataCaptureProposal>(
      "/api/data-capture/preview",
      {
        method: "POST",
        headers: this.actorHeaders(input),
      },
    );
  }

  intelligence(input: {
    kind: PixelRagIntelligenceKind;
    subject?: string;
    role?: string;
  }): Promise<PixelRagIntelligenceResult> {
    return this.request<PixelRagIntelligenceResult>("/api/intelligence", {
      method: "POST",
      body: {
        kind: input.kind,
        subject: input.subject ?? null,
      },
      headers: input.role
        ? { "X-User-Role": input.role }
        : undefined,
    });
  }

  private actorHeaders(input?: {
    actor?: string;
    role?: string;
  }): Record<string, string> | undefined {
    const headers: Record<string, string> = {};

    if (input?.actor) {
      headers["X-User-Name"] = input.actor;
    }

    if (input?.role) {
      headers["X-User-Role"] = input.role;
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  }
}
