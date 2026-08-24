import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

const documentIdInput = z.string().trim().min(1).max(200);

const tileSchema = z.object({
  score: z.number(),
  article_id: z.number().int().nonnegative(),
  tile_index: z.number().int().nonnegative(),
  chunk_index: z.number().int().nonnegative(),
  image_url: z.string(),
}).strict();

const visualMultiQaSchema = z.object({
  answer: z.string(),
  evidence: z.array(z.string()),
  sources: z.array(z.object({
    document_id: z.string(),
    document_name: z.string(),
    answer: z.string(),
    evidence: z.array(z.string()),
    tiles: z.array(tileSchema),
  }).strict()),
}).strict();

type VisualPixelRagService = {
  askAcrossDocumentsVisual(input: {
    question: string;
    documentIds: string[];
    topKPerDocument?: number;
    actor?: string;
    role?: string;
  }): Promise<unknown>;
};

function visualService(ctx: { pixelrag?: unknown }): VisualPixelRagService {
  const candidate = ctx.pixelrag as Partial<VisualPixelRagService> | undefined;
  if (!candidate?.askAcrossDocumentsVisual) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Visual multi-document intelligence is unavailable",
    });
  }
  return candidate as VisualPixelRagService;
}

function translate(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const status = typeof error === "object" && error !== null && "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : null;
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Visual multi-document intelligence is unavailable right now";

  if (status === 400 || status === 422) return new TRPCError({ code: "BAD_REQUEST", message });
  if (status === 401) return new TRPCError({ code: "UNAUTHORIZED", message });
  if (status === 403) return new TRPCError({ code: "FORBIDDEN", message });
  if (status === 404) return new TRPCError({ code: "NOT_FOUND", message });
  if (status === 409) return new TRPCError({ code: "CONFLICT", message });
  return new TRPCError({ code: "SERVICE_UNAVAILABLE", message });
}

export const pixelRagVisualRouter = router({
  compare: protectedProcedure
    .input(z.object({
      question: z.string().trim().min(1).max(1000),
      documentIds: z.array(documentIdInput).min(2).max(3),
      topKPerDocument: z.number().int().min(1).max(5).default(3),
    }).strict())
    .output(visualMultiQaSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const payload = await visualService(ctx).askAcrossDocumentsVisual({
          ...input,
          actor: ctx.session.user.id,
        });
        return visualMultiQaSchema.parse(payload);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new TRPCError({
            code: "BAD_GATEWAY",
            message: "PixelRAG returned an invalid visual multi-document response",
          });
        }
        throw translate(error);
      }
    }),
});
