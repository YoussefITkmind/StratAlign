import {
  createTRPCClient,
  httpBatchLink,
} from "@trpc/client";
import type { AppRouter } from "@spm/api";

const TRPC_URL =
  process.env.NEXT_PUBLIC_TRPC_URL ??
  "http://localhost:4000/trpc";

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: TRPC_URL,

      fetch(url, options) {
        return globalThis.fetch(url, {
          ...options,
          cache: "no-store",
        });
      },
    }),
  ],
});