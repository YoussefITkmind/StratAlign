import type { PrismaService } from "../../database/prisma.service";
import { performanceErrors } from "./performance.errors";

export interface CommentaryView {
  id: string;
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  authorId: string;
  bodyEn: string | null;
  bodyAr: string | null;
  createdAt: Date;
}

export interface AddCommentaryInput {
  kpiVersionId: string;
  scopeNodeId: string;
  period: string;
  authorId: string;
  bodyEn?: string | null;
  bodyAr?: string | null;
}

function normalise(body: string | null | undefined): string | null {
  const trimmed = body?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Bilingual commentary attached to a KPI/scope/period.
 *
 * Either language may be supplied on its own, or both together; at least one
 * must carry content. Commentary is ordinary mutable domain data — the
 * append-only rule belongs to Measurement, not here.
 */
export class CommentaryService {
  constructor(private readonly prisma: PrismaService) {}

  async add(input: AddCommentaryInput): Promise<CommentaryView> {
    const bodyEn = normalise(input.bodyEn);
    const bodyAr = normalise(input.bodyAr);

    if (bodyEn === null && bodyAr === null) {
      throw performanceErrors.commentaryContentRequired();
    }

    const created = await this.prisma.commentary.create({
      data: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
        authorId: input.authorId,
        bodyEn,
        bodyAr,
      },
    });

    return {
      id: created.id,
      kpiVersionId: created.kpiVersionId,
      scopeNodeId: created.scopeNodeId,
      period: created.period,
      authorId: created.authorId,
      bodyEn: created.bodyEn,
      bodyAr: created.bodyAr,
      createdAt: created.createdAt,
    };
  }

  async list(input: {
    kpiVersionId: string;
    scopeNodeId: string;
    period: string;
    limit: number;
  }): Promise<CommentaryView[]> {
    const rows = await this.prisma.commentary.findMany({
      where: {
        kpiVersionId: input.kpiVersionId,
        scopeNodeId: input.scopeNodeId,
        period: input.period,
      },
      orderBy: { createdAt: "desc" },
      take: input.limit,
    });

    return rows.map((row) => ({
      id: row.id,
      kpiVersionId: row.kpiVersionId,
      scopeNodeId: row.scopeNodeId,
      period: row.period,
      authorId: row.authorId,
      bodyEn: row.bodyEn,
      bodyAr: row.bodyAr,
      createdAt: row.createdAt,
    }));
  }
}
