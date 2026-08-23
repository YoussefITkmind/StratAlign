import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

/**
 * Read/proposal-only PixelRAG API boundary.
 *
 * No procedure in this router applies changes to StratAlign business data.
 * Smart Import and Data Capture are exposed as previews only.
 */

export interface PixelRagHealthOutput {
  status: string;
  service: string;
  version: string;
}

export interface PixelRagDocumentRecordOutput {
  id: string;
  name: string;
  status: "uploaded" | "processing" | "ready" | "failed";
  uploaded_at: string;
  page_count: number | null;
  size_bytes: number;
  error: string | null;
  legacy: boolean;
  original_type: string;
  normalized_from: string | null;
}

export interface PixelRagDocumentLibraryOutput {
  selected_document_id: string | null;
  documents: PixelRagDocumentRecordOutput[];
}

export interface PixelRagQaOutput {
  document_id: string;
  answer: string;
  evidence: string[];
  tiles: Array<{
    score: number;
    article_id: number;
    tile_index: number;
    chunk_index: number;
    image_url: string;
  }>;
}

export interface PixelRagMultiQaOutput {
  answer: string;
  evidence: string[];
  sources: Array<{
    document_id: string;
    document_name: string;
    answer: string;
    evidence: string[];
  }>;
}

export interface PixelRagServiceContract {
  health(): Promise<PixelRagHealthOutput>;
  listDocuments(): Promise<PixelRagDocumentLibraryOutput>;
  selectDocument(documentId: string): Promise<PixelRagDocumentRecordOutput>;

  ask(input: {
    question: string;
    topK?: number;
    role?: string;
  }): Promise<PixelRagQaOutput>;

  askAcrossDocuments(input: {
    question: string;
    documentIds: string[];
    topKPerDocument?: number;
  }): Promise<PixelRagMultiQaOutput>;

  previewSmartImport(input?: {
    actor?: string;
    role?: string;
  }): Promise<unknown>;

  previewDataCapture(input?: {
    actor?: string;
    role?: string;
  }): Promise<unknown>;

  intelligence(input: {
    kind:
      | "variance_explanation"
      | "executive_summary"
      | "explain_kpi"
      | "objective_health"
      | "initiative_impact"
      | "recommendations";
    subject?: string;
    role?: string;
  }): Promise<unknown>;
}

declare module "./index" {
  interface TrpcContext {
    pixelrag?: PixelRagServiceContract;
  }
}

function service(ctx: {
  pixelrag?: PixelRagServiceContract;
}): PixelRagServiceContract {
  if (!ctx.pixelrag) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Document intelligence is unavailable",
    });
  }

  return ctx.pixelrag;
}

function toPixelRagError(error: unknown): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }

  const status =
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : null;

  if (status === 404) {
    return new TRPCError({
      code: "NOT_FOUND",
      message: "The requested document was not found",
    });
  }

  if (status === 409) {
    return new TRPCError({
      code: "CONFLICT",
      message: "The document is not ready for this operation",
    });
  }

  if (status === 422 || status === 400) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: "The document intelligence request was invalid",
    });
  }

  return new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: "Document intelligence is unavailable right now",
  });
}

const documentStatusSchema = z.enum([
  "uploaded",
  "processing",
  "ready",
  "failed",
]);

const documentSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    status: documentStatusSchema,
    uploaded_at: z.string(),
    page_count: z.number().int().nonnegative().nullable(),
    size_bytes: z.number().int().nonnegative(),
    error: z.string().nullable(),
    legacy: z.boolean(),
    original_type: z.string(),
    normalized_from: z.string().nullable(),
  })
  .strict();

const healthSchema = z
  .object({
    status: z.string(),
    service: z.string(),
    version: z.string(),
  })
  .strict();

const librarySchema = z
  .object({
    selected_document_id: z.string().nullable(),
    documents: z.array(documentSchema),
  })
  .strict();

const qaSchema = z
  .object({
    document_id: z.string(),
    answer: z.string(),
    evidence: z.array(z.string()),
    tiles: z.array(
      z
        .object({
          score: z.number(),
          article_id: z.number().int().nonnegative(),
          tile_index: z.number().int().nonnegative(),
          chunk_index: z.number().int().nonnegative(),
          image_url: z.string(),
        })
        .strict(),
    ),
  })
  .strict();

const multiQaSchema = z
  .object({
    answer: z.string(),
    evidence: z.array(z.string()),
    sources: z.array(
      z
        .object({
          document_id: z.string(),
          document_name: z.string(),
          answer: z.string(),
          evidence: z.array(z.string()),
        })
        .strict(),
    ),
  })
  .strict();

const intelligenceKindSchema = z.enum([
  "variance_explanation",
  "executive_summary",
  "explain_kpi",
  "objective_health",
  "initiative_impact",
  "recommendations",
]);

export const pixelRagRouter = router({
  health: protectedProcedure
    .output(healthSchema)
    .query(async ({ ctx }) => {
      try {
        return await service(ctx).health();
      } catch (error) {
        throw toPixelRagError(error);
      }
    }),

  documents: protectedProcedure
    .output(librarySchema)
    .query(async ({ ctx }) => {
      try {
        return await service(ctx).listDocuments();
      } catch (error) {
        throw toPixelRagError(error);
      }
    }),

  selectDocument: protectedProcedure
    .input(
      z
        .object({
          documentId: z.string().trim().min(1).max(200),
        })
        .strict(),
    )
    .output(documentSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).selectDocument(input.documentId);
      } catch (error) {
        throw toPixelRagError(error);
      }
    }),

  ask: protectedProcedure
    .input(
      z
        .object({
          question: z.string().trim().min(1).max(1000),
          topK: z.number().int().min(1).max(5).default(3),
        })
        .strict(),
    )
    .output(qaSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).ask({
          question: input.question,
          topK: input.topK,
        });
      } catch (error) {
        throw toPixelRagError(error);
      }
    }),

  compare: protectedProcedure
    .input(
      z
        .object({
          question: z.string().trim().min(1).max(1000),
          documentIds: z.array(z.string().trim().min(1).max(200)).min(1).max(3),
          topKPerDocument: z.number().int().min(1).max(5).default(3),
        })
        .strict(),
    )
    .output(multiQaSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).askAcrossDocuments(input);
      } catch (error) {
        throw toPixelRagError(error);
      }
    }),

  previewSmartImport: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await service(ctx).previewSmartImport({
        actor: ctx.session.user.id,
      });
    } catch (error) {
      throw toPixelRagError(error);
    }
  }),

  previewDataCapture: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      return await service(ctx).previewDataCapture({
        actor: ctx.session.user.id,
      });
    } catch (error) {
      throw toPixelRagError(error);
    }
  }),

  intelligence: protectedProcedure
    .input(
      z
        .object({
          kind: intelligenceKindSchema,
          subject: z.string().trim().min(1).max(500).optional(),
        })
        .strict(),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        return await service(ctx).intelligence(input);
      } catch (error) {
        throw toPixelRagError(error);
      }
    }),
});
