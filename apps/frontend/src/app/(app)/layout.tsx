import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { AppNav } from "@/components/app-nav";
import { getCurrentAuthorization } from "@/services/iam.service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const authorization = await getCurrentAuthorization();
  const navigationRole = authorization?.roles.includes("platform_administrator")
    ? "platform_administrator"
    : "member";

  return (
    <div className="min-h-screen bg-slate-50">
      <AppNav role={navigationRole} email={session.user.email ?? ""} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
