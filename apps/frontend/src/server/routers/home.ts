import { authenticatedProcedure, router } from "@/server/trpc";
import { createBackendRegistryClient, translateBackendRegistryError } from "@/server/backend-registry-client";

const backend = (ctx: { cookieHeader: string | null }) => createBackendRegistryClient(ctx.cookieHeader);
const forward = async <T>(operation: () => Promise<T>): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    return translateBackendRegistryError(error);
  }
};

function normalizeStatus(status: string | null | undefined): "on_track" | "watch" | "off_track" | "unknown" {
  const value = (status ?? "").trim().toLowerCase().replaceAll("-", "_").replaceAll(" ", "_");
  if (value === "on_track" || value === "green") return "on_track";
  if (value === "watch" || value === "at_risk" || value === "amber") return "watch";
  if (value === "off_track" || value === "breached" || value === "red") return "off_track";
  return "unknown";
}

export const homeRouter = router({
  snapshot: authenticatedProcedure.query(async ({ ctx }) => {
    const api = backend(ctx);
    const registryRows = await forward(() => api.registry.kpi.list.query());
    const activeRows = registryRows.filter((row) => row.definition.status === "active").slice(0, 12);

    const details = await Promise.all(
      activeRows.map((row) =>
        forward(() => api.performance.detail.query({ kpiDefinitionId: row.definition.id })),
      ),
    );

    const kpis = details.flatMap((detail) => {
      if (!detail) return [];
      const measurements = [...detail.measurements].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
      const latestMeasurement = measurements.at(-1);
      if (!latestMeasurement) return [];

      const target = [...detail.targets]
        .reverse()
        .find(
          (candidate) =>
            candidate.scopeNodeId === latestMeasurement.scopeNodeId &&
            candidate.period === latestMeasurement.period,
        );
      const status = [...detail.statuses]
        .reverse()
        .find(
          (candidate) =>
            candidate.scopeNodeId === latestMeasurement.scopeNodeId &&
            candidate.period === latestMeasurement.period,
        );

      const history = measurements
        .filter((candidate) => candidate.scopeNodeId === latestMeasurement.scopeNodeId)
        .slice(-8)
        .map((candidate) => candidate.value);
      const prior = history.length > 1 ? history.at(-2) ?? null : null;

      return [{
        id: detail.definition.id,
        versionId: detail.version.id,
        name: detail.version.nameEn,
        unit: detail.version.unit,
        ownerName: detail.version.ownerName,
        ownerUserId: detail.version.ownerUserId,
        actual: latestMeasurement.value,
        target: target?.targetValue ?? null,
        delta: prior == null ? null : latestMeasurement.value - prior,
        history,
        status: normalizeStatus(status?.status),
        period: latestMeasurement.period,
        ownedByViewer: detail.version.ownerUserId === ctx.session.user.id,
      }];
    });

    return {
      kpis,
      upcomingReviews: await forward(() => api.scheduler.upcomingReviews.query()),
    };
  }),
});
