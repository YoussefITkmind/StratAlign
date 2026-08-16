import type { PrismaService } from "../../database/prisma.service";

/**
 * Read-only projection over the canonical scheduling tables for UI surfaces
 * such as the Home review calendar. Scheduling lifecycle/materialization stays
 * owned by SchedulerService/CadenceGeneratorService; this service never
 * creates or transitions cadence data.
 */
export class SchedulerReadService {
  constructor(private readonly prisma: PrismaService) {}

  async listUpcomingReviews(limit = 10) {
    const now = new Date();
    const rows = await this.prisma.cadenceInstance.findMany({
      where: {
        reviewDueAt: { gte: now },
        status: { in: ["PENDING", "OPEN", "CLOSING", "CLOSED", "REVIEW_DUE"] },
      },
      orderBy: { reviewDueAt: "asc" },
      take: limit,
      include: {
        cadenceDefinition: {
          select: {
            id: true,
            key: true,
            name: true,
            subjectType: true,
            subjectId: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      cadenceDefinitionId: row.cadenceDefinitionId,
      name: row.cadenceDefinition.name,
      subjectType: row.cadenceDefinition.subjectType,
      subjectId: row.cadenceDefinition.subjectId,
      periodKey: row.periodKey,
      status: row.status,
      reviewDueAt: row.reviewDueAt,
    }));
  }
}
