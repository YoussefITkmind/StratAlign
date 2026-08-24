import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, requireRole, router } from "./index";

export interface UnmappedPlayOutput {
  id: string;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
}

export interface PortfolioRagOutput {
  areaOfFocusId: string;
  period: string;
  status: "on_track" | "watch" | "off_track";
  score: number;
  initiativeCount: number;
  ruleId: string;
}

export interface PortfolioHierarchyDiffOutput {
  diffId: string;
  planVersionId: string;
  sourceFormat: "csv" | "json";
  sourceFileName: string | null;
  sourceChecksum: string;
  status: "dry_run" | "submitted" | "applied";
  initialDiff: {
    nodes: Array<{ id: string; type: "portfolio" | "area_of_focus"; nameEn: string; nameAr: string }>;
    edges: Array<{ id: string; fromNodeId: string; toNodeId: string; edgeType: "contains" | "belongs_to_portfolio" }>;
    mappings: Array<{ mappingId: string; edgeId: string; areaOfFocusId: string; suppliedPlayId?: string; suppliedPlayName?: string; resolution: "exact_id" | "exact_name" | "fuzzy" | "unresolved"; resolvedPlayId?: string; candidates: Array<{ id: string; nameEn: string; nameAr: string; similarity: number }>; conflict?: string }>;
    conflicts: string[];
  };
  resolutions: Record<string, string>;
  reviewedMappings: Array<PortfolioHierarchyDiffOutput["initialDiff"]["mappings"][number] & { selectedPlayId?: string }>;
  readyToCommit: boolean;
  noOp: boolean;
  stagedChangeId: string | null;
  approvalCaseId: string | null;
}

export interface PortfolioHierarchyCommitOutput {
  diffId: string;
  stagedChangeId: string;
  approvalCaseId: string;
  governanceState: string;
}

export interface PortfolioServiceContract {
  findUnmappedPlays(): Promise<UnmappedPlayOutput[]>;
  computeRag(areaOfFocusId: string, period: string): Promise<PortfolioRagOutput>;
  importHierarchyDryRun(input: { bytes: Buffer; format: "csv" | "json"; planVersionId: string; fileName?: string; actorUserId: string }): Promise<PortfolioHierarchyDiffOutput>;
  getHierarchyDiff(diffId: string): Promise<PortfolioHierarchyDiffOutput>;
  resolveHierarchyMatch(input: { diffId: string; mappingId: string; playId: string }): Promise<PortfolioHierarchyDiffOutput>;
  commitHierarchyImport(input: { diffId: string; approvalParticipantId: string; actorUserId: string }): Promise<PortfolioHierarchyCommitOutput>;
}

declare module "./index" {
  interface TrpcContext {
    portfolio?: PortfolioServiceContract;
  }
}

const service = (ctx: { portfolio?: PortfolioServiceContract }): PortfolioServiceContract => {
  if (!ctx.portfolio) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Portfolio service unavailable" });
  }
  return ctx.portfolio;
};

const fail = (error: unknown): never => {
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: error instanceof Error ? error.message : "Portfolio operation failed",
  });
};

const admin = () => requireRole("seo_administrator");

export const portfolioRouter = router({
  findUnmappedPlays: admin().query(async ({ ctx }) => {
    try {
      return await service(ctx).findUnmappedPlays();
    } catch (error) {
      return fail(error);
    }
  }),
  rag: router({
    compute: protectedProcedure
      .input(
        z.object({
          areaOfFocusId: z.string().uuid(),
          period: z.string().trim().min(1).max(40),
        }).strict(),
      )
      .query(async ({ ctx, input }) => {
        try {
          return await service(ctx).computeRag(input.areaOfFocusId, input.period);
        } catch (error) {
          return fail(error);
        }
      }),
  }),
  hierarchy: router({
    importDryRun: admin()
      .input(z.object({
        base64: z.string().min(1).max(14_000_000),
        format: z.enum(["csv", "json"]),
        planVersionId: z.string().uuid(),
        fileName: z.string().trim().min(1).max(255).optional(),
      }).strict())
      .mutation(async ({ ctx, input }) => {
        try {
          return await service(ctx).importHierarchyDryRun({ bytes: Buffer.from(input.base64, "base64"), format: input.format, planVersionId: input.planVersionId, ...(input.fileName ? { fileName: input.fileName } : {}), actorUserId: ctx.session.user.id });
        } catch (error) { return fail(error); }
      }),
    getDiff: admin()
      .input(z.object({ diffId: z.string().uuid() }).strict())
      .query(async ({ ctx, input }) => {
        try { return await service(ctx).getHierarchyDiff(input.diffId); }
        catch (error) { return fail(error); }
      }),
    resolveMatch: admin()
      .input(z.object({ diffId: z.string().uuid(), mappingId: z.string().uuid(), playId: z.string().uuid() }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).resolveHierarchyMatch(input); }
        catch (error) { return fail(error); }
      }),
    commit: admin()
      .input(z.object({ diffId: z.string().uuid(), approvalParticipantId: z.string().min(1).max(255) }).strict())
      .mutation(async ({ ctx, input }) => {
        try { return await service(ctx).commitHierarchyImport({ ...input, actorUserId: ctx.session.user.id }); }
        catch (error) { return fail(error); }
      }),
  }),
});
