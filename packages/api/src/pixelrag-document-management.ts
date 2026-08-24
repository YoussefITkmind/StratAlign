import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

const documentSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(["uploaded", "processing", "ready", "failed"]),
  uploaded_at: z.string(),
  page_count: z.number().int().nonnegative().nullable(),
  size_bytes: z.number().int().nonnegative(),
  error: z.string().nullable(),
  legacy: z.boolean(),
  original_type: z.string(),
  normalized_from: z.string().nullable(),
}).strict();

type PixelRagDocument = z.infer<typeof documentSchema>;

declare module "./pixelrag" {
  interface PixelRagServiceContract {
    deleteDocument(documentId: string, actor?: string): Promise<PixelRagDocument>;
  }
}

function toPixelRagError(error: unknown): TRPCError {
  if (error instanceof TRPCError) return error;
  const status = typeof error === "object" && error !== null && "status" in error &&
    typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : null;
  const message = error instanceof Error && error.message.trim()
    ? error.message
    : "Document intelligence is unavailable right now";
  if (status === 400 || status === 422) return new TRPCError({ code: "BAD_REQUEST", message });
  if (status === 401) return new TRPCError({ code: "UNAUTHORIZED", message });
  if (status === 403) return new TRPCError({ code: "FORBIDDEN", message });
  if (status === 404) return new TRPCError({ code: "NOT_FOUND", message });
  if (status === 409) return new TRPCError({ code: "CONFLICT", message });
  return new TRPCError({ code: "SERVICE_UNAVAILABLE", message });
}

export const pixelRagDocumentManagementRouter = router({
  removeDocument: protectedProcedure
    .input(z.object({ documentId: z.string().trim().min(1).max(200) }).strict())
    .output(documentSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.pixelrag) {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Document intelligence is unavailable" });
      }
      try {
        return await ctx.pixelrag.deleteDocument(input.documentId, ctx.session.user.id);
      } catch (error) {
        throw toPixelRagError(error);
      }
    }),
});
