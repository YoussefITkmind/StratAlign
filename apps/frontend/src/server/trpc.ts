import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { auth } from "@/lib/auth/auth";
import { findUserByEmail } from "@/server/mock-db";
import { headers } from "next/headers";
import { StepUpRequiredError } from "@spm/domain-iam";

export async function createTRPCContext() {
  const session = await auth();
  const user = session?.user?.email ? findUserByEmail(session.user.email) : undefined;
  const requestHeaders = await headers();
  return { session, user, cookieHeader: requestHeaders.get("cookie") };
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
        actionClass: error.cause instanceof StepUpRequiredError
          ? error.cause.actionClass
          : undefined,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// Track A procedures authorize against the canonical Auth.js session and then
// delegate role/scope enforcement to the backend IAM router. Track D's legacy
// mock-backed procedures continue to use `protectedProcedure` below.
export const authenticatedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session?.user?.id) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required." });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

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
