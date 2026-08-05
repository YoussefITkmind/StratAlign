import { headers } from "next/headers";
import { createBackendIamClient } from "@/server/backend-iam-client";

export async function getCurrentAuthorization() {
  const requestHeaders = await headers();
  try {
    return await createBackendIamClient(requestHeaders.get("cookie"))
      .iam.authorization.query();
  } catch {
    return null;
  }
}
