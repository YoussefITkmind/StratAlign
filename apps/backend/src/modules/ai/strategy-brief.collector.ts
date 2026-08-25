import type { PrismaService } from "../../database/prisma.service";
import type {
  NodeStatus,
  StrategyHierarchyNodeRecord,
} from "../strategy-hierarchy/strategy-hierarchy.service";

import { AiStrategyNotFoundError } from "./ai.errors";
import type {
  BriefNodeStatus,
  SnapshotObjective,
  SnapshotRiskSignal,
  SnapshotTheme,
  StrategyBriefSnapshot,
} from "./strategy-brief.types";

/** Only what the collector needs from the hierarchy service, so tests can fake it. */
export interface StrategyBriefTreeReader {
  getTree(): Promise<StrategyHierarchyNodeRecord | null>;
}

/**
 * Caps on how much of the tree reaches the model. A hierarchy is unbounded in
 * principle; a prompt is not. Everything below the cut is still counted in the
 * totals, so the brief never silently understates the size of the strategy.
 */
const MAX_THEMES = 20;
const MAX_OBJECTIVES = 40;
const MAX_RISK_SIGNALS = 24;
const MAX_TEXT_LENGTH = 2_000;

/** Node types that stand in for "strategic theme" and "strategic objective". */
const THEME_TYPE = "perspective";
const OBJECTIVE_TYPE = "objective";

interface FlatNode {
  readonly node: StrategyHierarchyNodeRecord;
  /** Nearest ancestor of type `perspective`, if any. */
  readonly theme: StrategyHierarchyNodeRecord | null;
}

function flatten(
  root: StrategyHierarchyNodeRecord,
  theme: StrategyHierarchyNodeRecord | null = null,
  into: FlatNode[] = [],
): FlatNode[] {
  into.push({ node: root, theme });
  const nextTheme = root.type === THEME_TYPE ? root : theme;
  for (const child of root.children) {
    flatten(child, nextTheme, into);
  }
  return into;
}

function toStatus(status: NodeStatus): BriefNodeStatus {
  return status;
}

function trimmed(value: string | null): string | null {
  const text = value?.trim();
  return text ? text.slice(0, MAX_TEXT_LENGTH) : null;
}

function isoDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * Whether a node's stored progress figure is meaningful enough to publish.
 *
 * A node that was never started and has nothing measurable attached has no
 * progress to report — its stored `0` is an initial value, not an observation.
 * Reporting it as "0%" would read as a measured result, so it is surfaced as
 * absent instead. Every other node reports the figure the platform holds.
 */
function reportableProgress(
  node: StrategyHierarchyNodeRecord,
  measureCount: number,
): number | null {
  if (node.status === "not-started" && node.progress === 0 && measureCount === 0) {
    return null;
  }
  return node.progress;
}

/**
 * Builds the bounded snapshot the Strategy Brief is generated from.
 *
 * Reads span two models on purpose. The Strategy Hierarchy owns the tree the
 * user actually edits; the older `strategy`/`registry` graph owns the OKRs and
 * KPI alignments that make an objective *measurable*. The two are correlated by
 * shared ids (see `StrategyNodeBridgeService`), and this collector is the only
 * place that joins them for briefing purposes — mirroring how
 * `ThemeContextBuilder` joins them for suggestion generation.
 *
 * Nothing here calls a model, and nothing here is nondeterministic beyond the
 * injected clock, so every number in a brief can be reproduced from the
 * database alone.
 */
export class StrategyBriefCollector {
  constructor(
    private readonly prisma: PrismaService,
    private readonly hierarchy: StrategyBriefTreeReader,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async collect(rootNodeId?: string): Promise<StrategyBriefSnapshot> {
    const tree = await this.hierarchy.getTree();

    if (!tree) {
      throw new AiStrategyNotFoundError();
    }

    if (rootNodeId && rootNodeId !== tree.id) {
      throw new AiStrategyNotFoundError();
    }

    const flat = flatten(tree);
    const objectiveNodes = flat.filter((entry) => entry.node.type === OBJECTIVE_TYPE);
    const measuresByObjective = await this.loadMeasureCounts(
      objectiveNodes.map((entry) => entry.node.id),
    );

    const themes = this.buildThemes(flat);
    const objectives = this.buildObjectives(objectiveNodes, measuresByObjective);

    const initiativeCount = flat.filter((entry) => entry.node.type === "initiative").length;
    const projectCount = flat.filter((entry) => entry.node.type === "project").length;
    const measuredObjectiveCount = objectives.filter(
      (objective) => objective.measureCount > 0,
    ).length;

    const insufficient = this.assessSufficiency(themes, objectives);

    return {
      rootNodeId: tree.id,
      title: tree.name,
      vision: trimmed(tree.description),
      owner: trimmed(tree.owner.name),
      status: toStatus(tree.status),
      progress: tree.progress,
      startDate: isoDate(tree.startDate),
      endDate: isoDate(tree.endDate),
      totalNodes: flat.length,
      themes,
      objectives,
      initiativeCount,
      projectCount,
      measuredObjectiveCount,
      riskSignals: this.buildRiskSignals(flat, objectives),
      insufficientData: insufficient !== null,
      insufficientDataReason: insufficient,
    };
  }

  /**
   * Counts what actually backs each objective: its own linked KPI labels, plus
   * every OKR and KPI alignment keyed on the mirrored strategy node that shares
   * its id. A missing mirror simply yields zero — the objective is then honestly
   * reported as unmeasured rather than failing the whole brief.
   */
  private async loadMeasureCounts(
    objectiveNodeIds: readonly string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();

    if (objectiveNodeIds.length === 0) {
      return counts;
    }

    const ids = [...objectiveNodeIds];
    const [okrs, alignments] = await Promise.all([
      this.prisma.okr.findMany({
        where: { objectiveNodeId: { in: ids } },
        select: { objectiveNodeId: true },
      }),
      this.prisma.alignment.findMany({
        where: { strategyNodeId: { in: ids } },
        select: { strategyNodeId: true },
      }),
    ]);

    for (const okr of okrs) {
      counts.set(okr.objectiveNodeId, (counts.get(okr.objectiveNodeId) ?? 0) + 1);
    }
    for (const alignment of alignments) {
      counts.set(alignment.strategyNodeId, (counts.get(alignment.strategyNodeId) ?? 0) + 1);
    }

    return counts;
  }

  private buildThemes(flat: readonly FlatNode[]): SnapshotTheme[] {
    return flat
      .filter((entry) => entry.node.type === THEME_TYPE)
      .slice(0, MAX_THEMES)
      .map((entry) => ({
        id: entry.node.id,
        name: entry.node.name,
        objectiveCount: flat.filter(
          (candidate) =>
            candidate.node.type === OBJECTIVE_TYPE && candidate.theme?.id === entry.node.id,
        ).length,
        status: toStatus(entry.node.status),
        progress: reportableProgress(entry.node, 1),
      }));
  }

  private buildObjectives(
    objectiveNodes: readonly FlatNode[],
    measuresByObjective: ReadonlyMap<string, number>,
  ): SnapshotObjective[] {
    return objectiveNodes.slice(0, MAX_OBJECTIVES).map((entry) => {
      const measureCount =
        (measuresByObjective.get(entry.node.id) ?? 0) + entry.node.linkedKpis.length;

      return {
        id: entry.node.id,
        name: entry.node.name,
        themeId: entry.theme?.id ?? null,
        themeName: entry.theme?.name ?? null,
        owner: trimmed(entry.node.owner.name),
        progress: reportableProgress(entry.node, measureCount),
        status: toStatus(entry.node.status),
        measureCount,
        initiativeCount: entry.node.children.filter(
          (child) => child.type === "initiative" || child.type === "project",
        ).length,
      };
    });
  }

  /**
   * Derives every concern the model is permitted to write about, straight from
   * the tree. The model may prioritise, phrase, and propose a mitigation for
   * these; it may not add one that is not here. An empty list is the honest
   * answer when nothing in the hierarchy is actually flagged.
   */
  private buildRiskSignals(
    flat: readonly FlatNode[],
    objectives: readonly SnapshotObjective[],
  ): SnapshotRiskSignal[] {
    const signals: SnapshotRiskSignal[] = [];
    const today = this.now();

    for (const { node, theme } of flat) {
      const area = node.type === THEME_TYPE ? node.name : (theme?.name ?? null);

      if (node.type === THEME_TYPE && node.status === "off-track") {
        signals.push({
          kind: "off_track_theme",
          area,
          nodeId: node.id,
          nodeName: node.name,
          detail: `Theme "${node.name}" is off track at ${node.progress}% progress.`,
        });
      } else if (node.type === THEME_TYPE && node.status === "at-risk") {
        signals.push({
          kind: "at_risk_theme",
          area,
          nodeId: node.id,
          nodeName: node.name,
          detail: `Theme "${node.name}" is at risk at ${node.progress}% progress.`,
        });
      }

      if (node.type === OBJECTIVE_TYPE && node.status === "off-track") {
        signals.push({
          kind: "off_track_objective",
          area,
          nodeId: node.id,
          nodeName: node.name,
          detail: `Objective "${node.name}" is off track at ${node.progress}% progress.`,
        });
      } else if (node.type === OBJECTIVE_TYPE && node.status === "at-risk") {
        signals.push({
          kind: "at_risk_objective",
          area,
          nodeId: node.id,
          nodeName: node.name,
          detail: `Objective "${node.name}" is at risk at ${node.progress}% progress.`,
        });
      }

      if (
        (node.type === "initiative" || node.type === "project") &&
        (node.status === "off-track" || node.status === "at-risk")
      ) {
        signals.push({
          kind: "stalled_initiative",
          area,
          nodeId: node.id,
          nodeName: node.name,
          detail: `${node.type === "initiative" ? "Initiative" : "Project"} "${node.name}" is ${node.status.replace("-", " ")} at ${node.progress}% progress.`,
        });
      }

      if (node.endDate && node.endDate.getTime() < today.getTime() && node.progress < 100) {
        signals.push({
          kind: "overdue_node",
          area,
          nodeId: node.id,
          nodeName: node.name,
          detail: `"${node.name}" passed its end date of ${isoDate(node.endDate)} at ${node.progress}% progress.`,
        });
      }
    }

    for (const objective of objectives) {
      if (objective.measureCount === 0) {
        signals.push({
          kind: "unmeasured_objective",
          area: objective.themeName,
          nodeId: objective.id,
          nodeName: objective.name,
          detail: `Objective "${objective.name}" has no KPI or OKR attached, so its progress cannot be verified.`,
        });
      }
      if (!objective.owner) {
        signals.push({
          kind: "unowned_objective",
          area: objective.themeName,
          nodeId: objective.id,
          nodeName: objective.name,
          detail: `Objective "${objective.name}" has no named owner.`,
        });
      }
    }

    return signals.slice(0, MAX_RISK_SIGNALS);
  }

  /**
   * Returns a human-readable reason when the tree cannot support a trustworthy
   * brief, or `null` when it can. This is a judgement about the *data*, made
   * before any model call — so an empty strategy never spends a token, and the
   * message the user sees never depends on what a model chose to say.
   */
  private assessSufficiency(
    themes: readonly SnapshotTheme[],
    objectives: readonly SnapshotObjective[],
  ): string | null {
    if (themes.length === 0 && objectives.length === 0) {
      return "This strategy has no themes or objectives yet, so there is nothing to summarise.";
    }
    if (objectives.length === 0) {
      return "This strategy has themes but no objectives yet, so its execution health cannot be assessed.";
    }
    return null;
  }
}
