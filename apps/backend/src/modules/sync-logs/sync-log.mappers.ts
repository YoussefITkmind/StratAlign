import type { SyncRunStatus } from "../../generated/prisma/enums";
import type { SyncRunStatusView } from "./sync-log.types";

/**
 * Prisma enum members are UPPER_SNAKE while the wire form is lowercase. Same
 * translation `registry.mappers.ts` does for `KpiStatus`, so casing never
 * leaks across this module's boundary.
 */
export function toSyncRunStatusView(value: SyncRunStatus): SyncRunStatusView {
  switch (value) {
    case "SUCCESS":
      return "success";
    case "FAILED":
      return "failed";
    case "PARTIAL":
      return "partial";
    case "RUNNING":
      return "running";
  }
}

export function fromSyncRunStatusView(value: SyncRunStatusView): SyncRunStatus {
  switch (value) {
    case "success":
      return "SUCCESS";
    case "failed":
      return "FAILED";
    case "partial":
      return "PARTIAL";
    case "running":
      return "RUNNING";
  }
}
