import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { protectedProcedure, router } from "./index";

/**
 * Sync Logs surface: list/read sync attempts, and trigger an AI investigation
 * of one.
 *
 * Follows the same shape as `ai-suggestion.ts`: the service contracts live
 * here, the backend supplies implementations through context, and the router
 * owns authentication, strict input validation, output validation, and the
 * mapping from domain errors to codes a client may see. Investigation never
 * mutates anything, so every procedure here needs nothing beyond a session —
 * there is no registry-author-style write to gate.
 */

export type SyncRunStatusOutput = "success" | "failed" | "partial" | "running";

export interface SyncRunOutput {
  id: string;
  sourceKey: string;
  sourceName: string;
  status: SyncRunStatusOutput;
  startedAt: Date;
  completedAt: Date | null;
  recordsProcessed: number | null;
  recordsCreated: number | null;
  recordsUpdated: number | null;
  recordsFailed: number | null;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface SyncRunDetailOutput extends SyncRunOutput {
  logExcerpt: string | null;
}

export interface SyncInvestigationResultOutput {
  syncRunId: string;
  diagnosis: string;
  likelyCause: string | null;
  recommendedNextSteps: string[];
  confidence: number;
  insufficientData: boolean;
  evidence: string[];
  provider: string;
  model: string;
  latencyMs: number;
}

export interface SyncLogServiceContract {
  list(input: {
    sourceKey?: string;
    status?: SyncRunStatusOutput;
    limit: number;
  }): Promise<SyncRunOutput[]>;

  getById(syncRunId: string): Promise<SyncRunDetailOutput | null>;
}

export interface SyncInvestigationServiceContract {
  investigate(input: { syncRunId: string }): Promise<SyncInvestigationResultOutput>;
}

declare module "./index" {
  interface TrpcContext {
    syncLog?: SyncLogServiceContract;
    syncInvestigation?: SyncInvestigationServiceContract;
  }
}

const id = z.string().uuid();
const statusSchema = z.enum(["success", "failed", "partial", "running"]);

function syncLogService(ctx: {
  syncLog?: SyncLogServiceContract;
}): SyncLogServiceContract {
  if (!ctx.syncLog) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Sync log service unavailable",
    });
  }
  return ctx.syncLog;
}

function syncInvestigationService(ctx: {
  syncInvestigation?: SyncInvestigationServiceContract;
}): SyncInvestigationServiceContract {
  if (!ctx.syncInvestigation) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Sync investigation service unavailable",
    });
  }
  return ctx.syncInvestigation;
}

const syncRunOutputSchema = z
  .object({
    id: z.string().uuid(),
    sourceKey: z.string(),
    sourceName: z.string(),
    status: statusSchema,
    startedAt: z.date(),
    completedAt: z.date().nullable(),
    recordsProcessed: z.number().int().nullable(),
    recordsCreated: z.number().int().nullable(),
    recordsUpdated: z.number().int().nullable(),
    recordsFailed: z.number().int().nullable(),
    errorCode: z.string().nullable(),
    errorMessage: z.string().nullable(),
  })
  .strict();

const syncRunDetailOutputSchema = syncRunOutputSchema.extend({
  logExcerpt: z.string().nullable(),
});

const investigationResultOutputSchema = z
  .object({
    syncRunId: z.string().uuid(),
    diagnosis: z.string(),
    likelyCause: z.string().nullable(),
    recommendedNextSteps: z.array(z.string()),
    confidence: z.number().min(0).max(1),
    insufficientData: z.boolean(),
    evidence: z.array(z.string()),
    provider: z.string(),
    model: z.string(),
    latencyMs: z.number().nonnegative(),
  })
  .strict();

/**
 * Maps a service failure to something a client may see. Same discipline as
 * `toSuggestionError`: every branch returns a fixed message, because an
 * upstream provider error or a database error can carry detail that must
 * never reach a browser.
 */
function toSyncLogError(error: unknown, fallback: string): TRPCError {
  if (error instanceof TRPCError) {
    return error;
  }

  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;

  switch (code) {
    case "SYNC_RUN_NOT_FOUND":
      return new TRPCError({ code: "NOT_FOUND", message: "Sync run was not found" });
    case "AI_UNAVAILABLE":
      return new TRPCError({
        code: "SERVICE_UNAVAILABLE",
        message: "AI investigation is unavailable right now. Try again later.",
      });
    case "AI_TIMEOUT":
      return new TRPCError({
        code: "TIMEOUT",
        message: "The AI service took too long to respond. Try again.",
      });
    case "AI_MALFORMED_OUTPUT":
      return new TRPCError({
        code: "UNPROCESSABLE_CONTENT",
        message: "The AI response could not be used. Try investigating again.",
      });
    default:
      return new TRPCError({ code: "BAD_REQUEST", message: fallback });
  }
}

export const syncLogRouter = router({
  /**
   * Read-only against the Sync Logs domain, so any signed-in user may list
   * and inspect sync runs — the same authorization level the audit log and
   * AI suggestion generation use.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          sourceKey: z.string().trim().min(1).max(200).optional(),
          status: statusSchema.optional(),
          limit: z.number().int().min(1).max(200).default(50),
        })
        .strict(),
    )
    .output(z.array(syncRunOutputSchema))
    .query(async ({ ctx, input }) => {
      try {
        return await syncLogService(ctx).list(input);
      } catch (error) {
        throw toSyncLogError(error, "Unable to list sync runs");
      }
    }),

  get: protectedProcedure
    .input(z.object({ syncRunId: id }).strict())
    .output(syncRunDetailOutputSchema.nullable())
    .query(async ({ ctx, input }) => {
      try {
        return await syncLogService(ctx).getById(input.syncRunId);
      } catch (error) {
        throw toSyncLogError(error, "Unable to load this sync run");
      }
    }),

  /**
   * A mutation, not a query: it spends money calling the model, is not
   * cacheable, and must never be replayed by a client-side refetch.
   */
  investigate: protectedProcedure
    .input(z.object({ syncRunId: id }).strict())
    .output(investigationResultOutputSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        return await syncInvestigationService(ctx).investigate(input);
      } catch (error) {
        throw toSyncLogError(error, "Unable to investigate this sync run");
      }
    }),
});
