import type { HealthStatus } from "@spm/api";
import { trpcClient } from "./api-client";

export type { HealthStatus };

export async function getHealthStatus(): Promise<HealthStatus | null> {
  try {
    return await trpcClient.health.check.query();
  } catch {
    return null;
  }
}