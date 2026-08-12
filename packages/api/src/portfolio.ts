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

export interface PortfolioServiceContract {
  findUnmappedPlays(): Promise<UnmappedPlayOutput[]>;
  computeRag(areaOfFocusId: string, period: string): Promise<PortfolioRagOutput>;
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
});
