import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/auth";
import { AppNav } from "@/components/app-nav";
import Sidebar from "@/components/layout/Sidebar";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex h-screen w-full flex-col overflow-y-auto bg-slate-50">
        <AppNav role={session.user.role} email={session.user.email ?? ""} />
        <main className="w-full max-w-none flex-1 mx-0 px-0 py-0">{children}</main>
      </div>
    </div>
  );
}
