"use server";

import { getCurrentAuthorization } from "@/services/iam.service";

export async function getMapAuthorization() {
  const authorization = await getCurrentAuthorization();
  const roles = authorization?.roles ?? [];

  // Strategy-map connection editing is an authoring capability. SEO administrators
  // already have scorecard/objective authoring access, so expose the analyst
  // capability to the map UI as an inherited permission as well.
  const mapRoles = roles.includes("seo_administrator") && !roles.includes("strategy_analyst")
    ? [...roles, "strategy_analyst"]
    : roles;

  return { roles: mapRoles };
}
