import type { PrismaService } from "../../database/prisma.service";

const SCORECARD_UI_PREFIX = "scorecard.ui.";

export class ScorecardUiService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<Array<{ scorecardId: string; uiData: unknown }>> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { startsWith: SCORECARD_UI_PREFIX } },
      orderBy: { key: "asc" },
      select: { key: true, value: true },
    });

    return rows.map((row) => ({
      scorecardId: row.key.slice(SCORECARD_UI_PREFIX.length),
      uiData: row.value,
    }));
  }

  async save(input: { scorecardId: string; uiData: Record<string, unknown> }): Promise<{ scorecardId: string; uiData: unknown }> {
    const scorecard = await this.prisma.scorecard.findUnique({
      where: { id: input.scorecardId },
      select: { id: true },
    });
    if (!scorecard) throw new Error("Scorecard does not exist");

    const key = `${SCORECARD_UI_PREFIX}${input.scorecardId}`;
    const row = await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: input.uiData },
      create: { key, value: input.uiData },
      select: { value: true },
    });

    return { scorecardId: input.scorecardId, uiData: row.value };
  }
}
