"use server";

import { getCurrentAuthorization } from "@/services/iam.service";

export async function getMapAuthorization() {
  const authorization = await getCurrentAuthorization();
  return { roles: authorization?.roles ?? [] };
}
