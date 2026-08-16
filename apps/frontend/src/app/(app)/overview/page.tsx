import type { Metadata } from "next";
import { getCurrentAuthorization } from "@/services/iam.service";
import { HomePage } from "@/components/home/HomePage";

export const metadata: Metadata = { title: "Home · StratAlign" };

export default async function Page() {
  const authorization = await getCurrentAuthorization();
  return <HomePage roles={authorization?.roles ?? []} />;
}
