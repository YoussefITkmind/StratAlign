import { z } from "zod";
import { authenticatedProcedure, publicProcedure, router } from "@/server/trpc";
import { createBackendAuthClient, translateBackendAuthError } from "@/server/backend-auth-client";

export const authRouter = router({
  session: authenticatedProcedure.query(({ ctx }) => ({
    user: {
      id: ctx.session.user.id,
      email: ctx.session.user.email ?? null,
      name: ctx.session.user.name ?? null,
    },
  })),
  signup: publicProcedure.input(z.object({
    displayName: z.string().trim().min(1).max(200),
    email: z.string().trim().email(),
    password: z.string().min(8).max(256),
  })).mutation(async ({ input }) => {
    try {
      return await createBackendAuthClient().auth.signup.mutate(input);
    } catch (error) {
      translateBackendAuthError(error);
    }
  }),
});
