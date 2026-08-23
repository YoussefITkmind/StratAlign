export type SyncRunStatus = "success" | "failed" | "partial" | "running";

export function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The operation could not be completed.";
}

export const STATUS_LABEL: Record<SyncRunStatus, string> = {
  success: "Success",
  failed: "Failed",
  partial: "Partial",
  running: "Running",
};

export const STATUS_BADGE_CLASS: Record<SyncRunStatus, string> = {
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  partial: "bg-amber-50 text-amber-700 border-amber-200",
  running: "bg-blue-50 text-blue-700 border-blue-200",
};
