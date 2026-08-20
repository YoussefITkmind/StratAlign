import type { Metadata } from "next";
import { getCurrentAuthorization } from "@/services/iam.service";
import { HomePage } from "@/components/home/HomePage";
import { resolveHomeComposition } from "@/server/home-composition";

export const metadata: Metadata = { title: "Home · StratAlign" };

export default async function Page() {
  const authorization = await getCurrentAuthorization();
  const composition = resolveHomeComposition(authorization?.roles ?? []);
  return <HomePage resolvedRole={composition.role} resolvedWidgets={composition.widgets} />;
}
