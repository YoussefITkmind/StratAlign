import { randomUUID } from "node:crypto";
import type { PrismaService } from "../../database/prisma.service";
import {
  StrategyHierarchyNodeType as PrismaNodeType,
  StrategyHierarchyNodeStatus as PrismaNodeStatus,
} from "../../generated/prisma/enums";
import { AiMalformedOutputError } from "../ai/ai.errors";
import type { LlmProvider } from "../ai/llm.provider";
import type { StrategyNodeBridgeService } from "./strategy-node-bridge.service";

export type NodeType = "plan" | "perspective" | "objective" | "initiative" | "project";
export type NodeStatus = "on-track" | "at-risk" | "off-track" | "not-started";

export interface StrategyHierarchyOwnerRecord {
  name: string;
  initials: string;
  color: string;
}

export interface StrategyHierarchyActivityRecord {
  id: string;
  message: string;
  actor: string;
  createdAt: Date;
}

export interface StrategyHierarchyNodeRecord {
  id: string;
  parentId: string | null;
  name: string;
  type: NodeType;
  status: NodeStatus;
  progress: number;
  owner: StrategyHierarchyOwnerRecord;
  budget: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  linkedKpis: string[];
  createdAt: Date;
  activity: StrategyHierarchyActivityRecord[];
  children: StrategyHierarchyNodeRecord[];
}

export interface CreateStrategyHierarchyNodeInput {
  parentId: string | null;
  name: string;
  type: NodeType;
  status: NodeStatus;
  progress: number;
  ownerName: string;
  budget?: string;
  startDate?: Date;
  endDate?: Date;
  description?: string;
  linkedKpis?: string[];
  actorUserId: string;
  actorName: string;
}

export interface UpdateStrategyHierarchyNodeInput {
  id: string;
  patch: {
    name?: string;
    type?: NodeType;
    status?: NodeStatus;
    progress?: number;
    ownerName?: string;
    budget?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    description?: string | null;
    linkedKpis?: string[];
  };
  actorUserId: string;
  actorName: string;
}

export interface DeleteStrategyHierarchyNodeInput {
  id: string;
  actorUserId: string;
  actorName: string;
}

const TYPE_TO_DB: Record<NodeType, PrismaNodeType> = {
  plan: PrismaNodeType.PLAN,
  perspective: PrismaNodeType.PERSPECTIVE,
  objective: PrismaNodeType.OBJECTIVE,
  initiative: PrismaNodeType.INITIATIVE,
  project: PrismaNodeType.PROJECT,
};

const TYPE_FROM_DB: Record<PrismaNodeType, NodeType> = {
  PLAN: "plan",
  PERSPECTIVE: "perspective",
  OBJECTIVE: "objective",
  INITIATIVE: "initiative",
  PROJECT: "project",
};

const STATUS_TO_DB: Record<NodeStatus, PrismaNodeStatus> = {
  "on-track": PrismaNodeStatus.ON_TRACK,
  "at-risk": PrismaNodeStatus.AT_RISK,
  "off-track": PrismaNodeStatus.OFF_TRACK,
  "not-started": PrismaNodeStatus.NOT_STARTED,
};

const STATUS_FROM_DB: Record<PrismaNodeStatus, NodeStatus> = {
  ON_TRACK: "on-track",
  AT_RISK: "at-risk",
  OFF_TRACK: "off-track",
  NOT_STARTED: "not-started",
};

const STATUS_LABEL: Record<NodeStatus, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  "off-track": "Off track",
  "not-started": "Not started",
};

// Mirrors apps/frontend/src/lib/strategyConfig.ts exactly, so an owner's
// avatar color is identical whether it's assigned here or client-side.
const OWNER_PALETTE = [
  "bg-indigo-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-purple-500",
  "bg-cyan-600",
  "bg-teal-500",
];

function colorForInitials(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return OWNER_PALETTE[hash % OWNER_PALETTE.length];
}

const DRAFT_DESCRIPTION_FEATURE = "strategy_hierarchy.draft_description";
const DRAFT_MAX_OUTPUT_TOKENS = 300;
const DRAFT_TEMPERATURE = 0.6;

const DRAFT_DESCRIPTION_SYSTEM_PROMPT =
  "You write a single concise paragraph (2-3 sentences) describing a node in an " +
  "enterprise strategy execution platform. Return plain text only: no markdown, " +
  "no headings, no surrounding quotes.";

const NODE_TYPE_LABEL: Record<NodeType, string> = {
  plan: "strategic plan",
  perspective: "strategic perspective",
  objective: "strategic objective",
  initiative: "initiative",
  project: "project",
};

function buildDraftDescriptionPrompt(input: { name: string; type: NodeType; parentName?: string }): string {
  const parentLine = input.parentName ? ` It sits under the parent node "${input.parentName}".` : "";
  return `Write a description for a ${NODE_TYPE_LABEL[input.type]} named "${input.name}".${parentLine}`;
}

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

interface NodeRow {
  id: string;
  parentId: string | null;
  name: string;
  type: PrismaNodeType;
  status: PrismaNodeStatus;
  progress: number;
  ownerName: string;
  ownerInitials: string;
  ownerColor: string;
  budget: string | null;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  linkedKpis: string[];
  createdAt: Date;
  activity: { id: string; message: string; actorName: string; createdAt: Date }[];
}

function mapRow(row: NodeRow): Omit<StrategyHierarchyNodeRecord, "children"> {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    type: TYPE_FROM_DB[row.type],
    status: STATUS_FROM_DB[row.status],
    progress: row.progress,
    owner: { name: row.ownerName, initials: row.ownerInitials, color: row.ownerColor },
    budget: row.budget,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
    linkedKpis: row.linkedKpis,
    createdAt: row.createdAt,
    activity: row.activity
      .slice()
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((a) => ({ id: a.id, message: a.message, actor: a.actorName, createdAt: a.createdAt })),
  };
}

function buildTree(rows: Omit<StrategyHierarchyNodeRecord, "children">[]): StrategyHierarchyNodeRecord | null {
  const byParent = new Map<string, Omit<StrategyHierarchyNodeRecord, "children">[]>();
  for (const row of rows) {
    const key = row.parentId ?? "";
    const bucket = byParent.get(key) ?? [];
    bucket.push(row);
    byParent.set(key, bucket);
  }

  const attach = (row: Omit<StrategyHierarchyNodeRecord, "children">): StrategyHierarchyNodeRecord => ({
    ...row,
    children: (byParent.get(row.id) ?? [])
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map(attach),
  });

  const roots = (byParent.get("") ?? []).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  return roots.length > 0 ? attach(roots[0]!) : null;
}

export class StrategyHierarchyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bridge: StrategyNodeBridgeService,
    private readonly llm: LlmProvider,
  ) {}

  async getTree(): Promise<StrategyHierarchyNodeRecord | null> {
    const rows = await this.prisma.strategyHierarchyNode.findMany({
      include: { activity: true },
    });
    return buildTree(rows.map(mapRow));
  }

  async draftDescription(input: { name: string; type: NodeType; parentName?: string }): Promise<{ draft: string }> {
    const completion = await this.llm.complete({
      system: DRAFT_DESCRIPTION_SYSTEM_PROMPT,
      prompt: buildDraftDescriptionPrompt(input),
      maxOutputTokens: DRAFT_MAX_OUTPUT_TOKENS,
      temperature: DRAFT_TEMPERATURE,
      feature: DRAFT_DESCRIPTION_FEATURE,
    });

    const draft = completion.text.trim();
    if (!draft) {
      throw new AiMalformedOutputError("The AI service returned no content");
    }

    return { draft };
  }

  private async requireNode(id: string) {
    const node = await this.prisma.strategyHierarchyNode.findUnique({ where: { id } });
    if (!node) throw new Error("Strategy hierarchy node not found");
    return node;
  }

  async createNode(input: CreateStrategyHierarchyNodeInput): Promise<StrategyHierarchyNodeRecord> {
    if (input.parentId) {
      await this.requireNode(input.parentId);
    } else {
      const existingRoot = await this.prisma.strategyHierarchyNode.findFirst({ where: { parentId: null } });
      if (existingRoot) throw new Error("A root node already exists — add this node under an existing parent instead");
    }

    const ownerName = input.ownerName.trim();
    const created = await this.prisma.strategyHierarchyNode.create({
      data: {
        parentId: input.parentId,
        name: input.name.trim(),
        type: TYPE_TO_DB[input.type],
        status: STATUS_TO_DB[input.status],
        progress: Math.min(100, Math.max(0, Math.round(input.progress))),
        ownerName,
        ownerInitials: deriveInitials(ownerName),
        ownerColor: colorForInitials(ownerName),
        budget: input.budget?.trim() || null,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        description: input.description?.trim() || null,
        linkedKpis: input.linkedKpis ?? [],
        createdBy: input.actorUserId,
        activity: {
          create: { id: randomUUID(), message: "Node created", actorName: input.actorName },
        },
      },
      include: { activity: true },
    });

    // Best-effort: Add Node must succeed even if the AI-suggestion/registry
    // mirror sync hits an edge case (e.g. a transient DB error).
    await this.bridge
      .syncNode({ id: created.id, parentId: created.parentId, name: created.name, type: input.type, createdBy: input.actorUserId })
      .catch(() => {});

    return { ...mapRow(created), children: [] };
  }

  async updateNode(input: UpdateStrategyHierarchyNodeInput): Promise<StrategyHierarchyNodeRecord> {
    const current = await this.requireNode(input.id);
    const { patch } = input;

    const activityEntries: { id: string; message: string; actorName: string }[] = [];
    if (patch.status !== undefined && STATUS_TO_DB[patch.status] !== current.status) {
      activityEntries.push({
        id: randomUUID(),
        message: `Status updated to ${STATUS_LABEL[patch.status]}`,
        actorName: input.actorName,
      });
    }
    if (patch.progress !== undefined && patch.progress !== current.progress) {
      activityEntries.push({
        id: randomUUID(),
        message: `Progress updated to ${patch.progress}%`,
        actorName: input.actorName,
      });
    }

    const ownerName = patch.ownerName?.trim();

    const updated = await this.prisma.strategyHierarchyNode.update({
      where: { id: input.id },
      data: {
        name: patch.name?.trim(),
        type: patch.type ? TYPE_TO_DB[patch.type] : undefined,
        status: patch.status ? STATUS_TO_DB[patch.status] : undefined,
        progress: patch.progress !== undefined ? Math.min(100, Math.max(0, Math.round(patch.progress))) : undefined,
        ownerName,
        ownerInitials: ownerName ? deriveInitials(ownerName) : undefined,
        ownerColor: ownerName ? colorForInitials(ownerName) : undefined,
        budget: patch.budget === undefined ? undefined : patch.budget?.trim() || null,
        startDate: patch.startDate,
        endDate: patch.endDate,
        description: patch.description === undefined ? undefined : patch.description?.trim() || null,
        linkedKpis: patch.linkedKpis,
        activity: activityEntries.length > 0 ? { create: activityEntries } : undefined,
      },
      include: { activity: true },
    });

    if (patch.name !== undefined) {
      await this.bridge.renameNode(updated.id, updated.name).catch(() => {});
    }

    return { ...mapRow(updated), children: [] };
  }

  async deleteNode(input: DeleteStrategyHierarchyNodeInput): Promise<{ deleted: true }> {
    const node = await this.requireNode(input.id);
    if (node.parentId === null) {
      throw new Error("Cannot delete the root node");
    }

    // Deleting cascades to every descendant on the hierarchy side, so their
    // mirrors (if any) need retiring too, before the rows they describe
    // disappear from this tree.
    const idsToRetire = await this.collectDescendantIds(input.id);
    await this.prisma.strategyHierarchyNode.delete({ where: { id: input.id } });
    await Promise.all(idsToRetire.map((id) => this.bridge.retireNode(id)));

    return { deleted: true };
  }

  private async collectDescendantIds(rootId: string): Promise<string[]> {
    const ids = [rootId];
    let frontier = [rootId];
    while (frontier.length > 0) {
      const children = await this.prisma.strategyHierarchyNode.findMany({
        where: { parentId: { in: frontier } },
        select: { id: true },
      });
      frontier = children.map((c) => c.id);
      ids.push(...frontier);
    }
    return ids;
  }

  /** One-time sync for hierarchy nodes created before this bridge shipped. */
  async backfillBridge(): Promise<{ perspectives: number; objectives: number }> {
    return this.bridge.backfillAll();
  }
}
