import { describe, expect, it } from "vitest";
import { validateEnvironment } from "../../src/config/env.validation";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "4000",
  FRONTEND_URL: "http://localhost:3000",
  DATABASE_URL:
    "postgresql://spm:spm_dev_password@localhost:5432/spm_platform",
  REDIS_URL: "redis://localhost:6379",
};

describe("validateEnvironment", () => {
  it("accepts valid environment variables", () => {
    expect(() => validateEnvironment(validEnvironment)).not.toThrow();
  });

  it("rejects a port outside the valid range", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        PORT: "99999",
      }),
    ).toThrow("PORT must not be greater than 65535");
  });

  it("rejects a missing database URL", () => {
    const environmentWithoutDatabase = {
      ...validEnvironment,
      DATABASE_URL: undefined,
    };

    expect(() =>
      validateEnvironment(environmentWithoutDatabase),
    ).toThrow("Environment validation failed");
  });

  it("rejects an invalid Redis URL", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        REDIS_URL: "http://localhost:6379",
      }),
    ).toThrow("REDIS_URL must be a Redis connection URL");
  });
});