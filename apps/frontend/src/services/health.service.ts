import { apiRequest } from "./api-client";

export type HealthStatus = {
  status: string;
  service: string;
  database: string;
  redis: string;
  timestamp: string;
  uptimeSeconds: number;
};

export async function getHealthStatus(): Promise<HealthStatus | null> {
  try {
    return await apiRequest<HealthStatus>("/health");
  } catch {
    return null;
  }
}