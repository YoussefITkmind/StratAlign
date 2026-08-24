import { z } from "zod";
import { publicProcedure, router } from "@/server/trpc";
import { createBackendAuthClient, translateBackendAuthError } from "@/server/backend-auth-client";

export const authRouter = router({
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
