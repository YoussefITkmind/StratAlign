import DashboardWorkspace from "@/components/dashboard/DashboardWorkspace";
import { auth } from "@/lib/auth/auth";
import { getDisplayName } from "@/lib/user";

export default async function DashboardPage() {
  const session = await auth();
  const displayName = getDisplayName(session?.user?.name, session?.user?.email);

  return (
    <>
      <h1 className="sr-only">Welcome, {displayName}</h1>
      <DashboardWorkspace />
    </>
  );
}
