import { Injectable } from "@nestjs/common";

@Injectable()
export class HealthService {
  check() {
    return {
      status: "ok",
      service: "spm-backend",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}