import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth/auth";
import { findUserByEmail, stepUpVerifications } from "@/server/mock-db";

/** Step-up re-auth is considered fresh for this long. */
const STEP_UP_TTL_MS = 5 * 60 * 1000;

export async function createTRPCContext() {
  const session = await auth();
  const user = session?.user?.email ? findUserByEmail(session.user.email) : undefined;
  return { session, user };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // Custom, stable code the frontend checks for to trigger the
        // step-up modal — TRPCError's built-in `code` enum has no
        // "step up required" value, so we carry it as extra error data
        // instead of overloading FORBIDDEN's meaning silently.
        stepUpRequired: error.cause instanceof StepUpRequiredError,
        ownSubmission: error.cause instanceof OwnSubmissionError,
      },
    };
  },
});

export class StepUpRequiredError extends Error {}
/** Separation-of-duties: submitter tried to decide their own governance case. */
export class OwnSubmissionError extends Error {}

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

/** Real authorization check — rejects at the procedure level, not just hidden nav. */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "platform_administrator") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires the platform_administrator role.",
    });
  }
  return next({ ctx });
});

/**
 * Wrap a sensitive admin mutation so it requires a fresh step-up re-auth
 * (verified via `iam.verifyStepUp`) within the last 5 minutes. Mirrors the
 * intended `withStepUpCheck` contract from Prompt 1.2: throws a
 * distinguishable error the client can catch and respond to by opening the
 * step-up modal, without forcing a full logout.
 */
export function requireStepUp<T extends { user: { id: string } }>(ctx: T) {
  const verifiedAt = stepUpVerifications.get(ctx.user.id);
  const fresh = verifiedAt && Date.now() - new Date(verifiedAt).getTime() < STEP_UP_TTL_MS;
  if (!fresh) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Re-authentication required to complete this action.",
      cause: new StepUpRequiredError(),
    });
  }
}
