import { auth } from "@/lib/auth/auth";

export default async function DashboardPage() {
  const session = await auth();
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-8">
      <h1 className="text-[1.4rem] font-bold tracking-tight text-slate-900">
        Welcome, {session?.user?.name ?? session?.user?.email}
      </h1>
      <p className="mt-1.5 text-[14px] text-slate-500">
        Signed in as {session?.user?.email} ·{" "}
        {session?.user?.role === "platform_administrator" ? "Platform administrator" : "Member"}
      </p>
    </div>
  );
}
