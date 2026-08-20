import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentAuthorization } from "@/services/iam.service";
import { getDisplayName } from "@/lib/user";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const authorization = await getCurrentAuthorization();
  const navigationRole = authorization?.roles.includes("platform_administrator")
    ? "platform_administrator"
    : "member";

  const email = session?.user?.email ?? "demo@stratalign.app";
  const name = getDisplayName(session?.user?.name, email);

  return (
    <AppShell role={navigationRole} email={email} name={name}>
      {children}
    </AppShell>
  );
}
