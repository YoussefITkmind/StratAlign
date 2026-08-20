import type { PlatformRole } from "@spm/domain-iam";
import { resolveHomeRole, widgetsForRole, type WidgetKey } from "@/lib/roleWidgetConfig";

export interface HomeComposition {
  role: PlatformRole | null;
  widgets: WidgetKey[];
}

/** Server-side authority for the authenticated user's dashboard composition. */
export function resolveHomeComposition(roles: readonly PlatformRole[]): HomeComposition {
  const role = resolveHomeRole(roles);
  return { role, widgets: widgetsForRole(role) };
}
