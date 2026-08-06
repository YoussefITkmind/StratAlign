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

  it("applies Track C defaults when nothing is configured", () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.QUEUE_PREFIX).toBe("spm");
    expect(environment.SCHEDULER_ENABLED).toBe(true);
    expect(environment.SCHEDULER_TICK_INTERVAL_MS).toBe(60_000);
    expect(environment.NOTIFICATION_DEFAULT_LOCALE).toBe("en");
    expect(environment.NOTIFICATION_FALLBACK_LOCALE).toBe("en");
    expect(environment.DIGEST_ENABLED).toBe(true);
  });

  it("defaults notification senders to fake so no deployment mails real people by accident", () => {
    expect(validateEnvironment(validEnvironment).NOTIFICATION_SENDER_MODE).toBe("fake");
  });

  describe("boolean flags", () => {
    it("reads the string \"false\" as false rather than as a truthy string", () => {
      const environment = validateEnvironment({
        ...validEnvironment,
        SCHEDULER_ENABLED: "false",
      });

      expect(environment.SCHEDULER_ENABLED).toBe(false);
    });

    it("accepts the conventional spellings", () => {
      for (const [value, expected] of [
        ["1", true],
        ["true", true],
        ["yes", true],
        ["on", true],
        ["0", false],
        ["no", false],
        ["off", false],
        ["FALSE", false],
      ] as const) {
        expect(
          validateEnvironment({ ...validEnvironment, DIGEST_ENABLED: value })
            .DIGEST_ENABLED,
        ).toBe(expected);
      }
    });

    it("rejects a value that is neither true nor false", () => {
      expect(() =>
        validateEnvironment({ ...validEnvironment, DIGEST_ENABLED: "maybe" }),
      ).toThrow("Environment validation failed");
    });
  });

  it("rejects a tick interval below one second", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        SCHEDULER_TICK_INTERVAL_MS: "500",
      }),
    ).toThrow("SCHEDULER_TICK_INTERVAL_MS must be at least 1000");
  });

  it("rejects a malformed sender email address", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        EMAIL_FROM_ADDRESS: "not-an-address",
      }),
    ).toThrow("EMAIL_FROM_ADDRESS must be a valid email address");
  });
});