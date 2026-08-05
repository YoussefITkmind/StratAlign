import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOidcStepUpState,
  verifyOidcStepUpState,
} from "../src/lib/auth/oidc-step-up-state";

const { auth, signIn, setCookie } = vi.hoisted(() => ({
  auth: vi.fn(), signIn: vi.fn(), setCookie: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({ auth, signIn }));
vi.mock("@/auth", () => ({ GENERIC_OIDC_PROVIDER_ID: "generic-oidc" }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ set: setCookie })),
}));

describe("OIDC step-up state", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-auth-secret-at-least-32-characters-long";
    auth.mockReset(); signIn.mockReset(); setCookie.mockReset();
  });

  it("is signed, expires, and remains bound to the expected platform UUID", () => {
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const state = createOidcStepUpState(userId, process.env.AUTH_SECRET!, 1_000);
    expect(verifyOidcStepUpState(state, process.env.AUTH_SECRET!, 2_000)).toBe(userId);
    expect(verifyOidcStepUpState(`${state}tampered`, process.env.AUTH_SECRET!, 2_000)).toBeNull();
    expect(verifyOidcStepUpState(state, process.env.AUTH_SECRET!, 301_001)).toBeNull();
  });

  it("initiates canonical OIDC with forced fresh authentication", async () => {
    auth.mockResolvedValue({
      user: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
    signIn.mockResolvedValue(undefined);
    const { GET } = await import("../src/app/api/auth/oidc-step-up/route");
    await GET(new Request("http://localhost:3000/api/auth/oidc-step-up"));
    expect(setCookie).toHaveBeenCalledWith(expect.objectContaining({
      httpOnly: true, sameSite: "lax", path: "/",
    }));
    expect(signIn).toHaveBeenCalledWith(
      "generic-oidc",
      { redirectTo: "/admin?stepUp=complete" },
      { prompt: "login", max_age: "0" },
    );
  });
});
