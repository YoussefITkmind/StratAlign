import { describe, expect, it } from "vitest";
import { validateEnvironment } from "../../src/config/env.validation";

const validEnvironment = {
  NODE_ENV: "test",
  PORT: "4000",
  FRONTEND_URL: "http://localhost:3000",
  DATABASE_URL:
    "postgresql://spm:spm_dev_password@localhost:5432/spm_platform",
  REDIS_URL: "redis://localhost:6379",
  OBJECT_STORAGE_ENDPOINT: "http://localhost:19000",
  OBJECT_STORAGE_ACCESS_KEY: "test-access-key",
  OBJECT_STORAGE_SECRET_KEY: "test-secret-key",
  OBJECT_STORAGE_BUCKET: "artifacts",
  AUTH_SECRET: "test-auth-secret-at-least-32-characters-long",
  AUTH_OIDC_ISSUER: "http://localhost:8092/",
  AUTH_OIDC_CLIENT_ID: "spm-web",
  AUTH_OIDC_JWKS_URI: "http://127.0.0.1:8092/jwks",
};

describe("validateEnvironment", () => {
  it("accepts valid environment variables", () => {
    expect(() => validateEnvironment(validEnvironment)).not.toThrow();
  });

  it("defaults verified-email linking to false", () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING).toBe(false);
  });

  it.each([
    ["true", true],
    ["false", false],
  ] as const)("parses verified-email linking value %s", (value, expected) => {
    const environment = validateEnvironment({
      ...validEnvironment,
      AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING: value,
    });

    expect(environment.AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING).toBe(expected);
  });

  it.each(["1", "yes", "TRUE", "", " false "])(
    "rejects unsupported verified-email linking value %s",
    (value) => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          AUTH_OIDC_ALLOW_VERIFIED_EMAIL_LINKING: value,
        }),
      ).toThrow("Environment validation failed");
    },
  );

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

  it("rejects a missing authentication secret", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_SECRET: undefined,
      }),
    ).toThrow("Environment validation failed");
  });

  it("preserves the configured OIDC issuer exactly", () => {
    const environment = validateEnvironment({
      ...validEnvironment,
      AUTH_OIDC_ISSUER: "https://identity.example.test/tenant/",
      AUTH_OIDC_JWKS_URI: "https://identity.example.test/jwks",
    });

    expect(environment.AUTH_OIDC_ISSUER).toBe(
      "https://identity.example.test/tenant/",
    );
  });

  it.each([
    "AUTH_OIDC_ISSUER",
    "AUTH_OIDC_CLIENT_ID",
    "AUTH_OIDC_JWKS_URI",
  ] as const)("rejects a missing %s", (field) => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        [field]: undefined,
      }),
    ).toThrow("Environment validation failed");
  });

  it("requires HTTPS for OIDC URLs in production", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        NODE_ENV: "production",
      }),
    ).toThrow("must use HTTPS");
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "permits loopback HTTP for %s outside production",
    (hostname) => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          AUTH_OIDC_ISSUER: `http://${hostname}:8092/`,
          AUTH_OIDC_JWKS_URI: `http://${hostname}:8092/jwks`,
        }),
      ).not.toThrow();
    },
  );

  it("rejects non-loopback HTTP OIDC URLs", () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_OIDC_ISSUER: "http://identity.example.test/",
        AUTH_OIDC_JWKS_URI: "http://identity.example.test/jwks",
      }),
    ).toThrow("must use HTTPS");
  });

  it.each([
    "https://user:password@identity.example.test/",
    "https://identity.example.test/?tenant=example",
    "https://identity.example.test/#configuration",
  ])("rejects unsafe OIDC URLs: %s", (unsafeUrl) => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        AUTH_OIDC_ISSUER: unsafeUrl,
      }),
    ).toThrow("Environment validation failed");
  });
});
