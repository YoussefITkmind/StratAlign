"use client";

import { trpc } from "@/lib/trpc/client";

export interface OwnerOption {
  id: string;
  name: string;
}

/**
 * Owner selection is backed by the real credential-user directory when the
 * caller has permission to read it (seo_administrator). Most initiative/
 * project creators don't hold that role, so the caller falls back to typing
 * a raw user ID — same as the pre-existing initiative form — instead of
 * being blocked entirely.
 */
export function useOwnerOptions() {
  const query = trpc.iam.listCredentialUsers.useQuery(undefined, { retry: false });
  const options: OwnerOption[] = query.data ?? [];
  return {
    options,
    isRealData: !query.isLoading && !query.isError && options.length > 0,
    isLoading: query.isLoading,
  };
}
