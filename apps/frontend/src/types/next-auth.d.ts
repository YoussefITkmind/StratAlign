import type { DefaultSession } from "next-auth";

type AppRole = "platform_administrator" | "member";

declare module "next-auth" {
  interface Session {
    authenticationMethod?: "credentials" | "oidc";
    user: {
      id: string;
      role: AppRole;
    } & DefaultSession["user"];
  }

  interface User {
    role?: AppRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: AppRole;
    sessionId?: string;
    authenticationTime?: number;
    authenticationMethod?: "credentials" | "oidc";
  }
}
