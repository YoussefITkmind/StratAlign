export type CanonicalStrategyNodeType =
  | "corporate_strategy"
  | "theme"
  | "objective"
  | "strategic_play"
  | "portfolio"
  | "area_of_focus";

export type CanonicalStrategyNodeState = "draft" | "active" | "retired";
export type CanonicalStrategyEdgeType =
  | "contains"
  | "executed_by"
  | "belongs_to_portfolio"
  | "aligns_to";

export interface CanonicalStrategyNode {
  id: string;
  type: CanonicalStrategyNodeType;
  nameEn: string;
  nameAr: string;
  planVersionId: string;
  state: CanonicalStrategyNodeState;
  createdBy: string;
  createdAt: Date | string;
}

export interface CanonicalStrategyEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  edgeType: CanonicalStrategyEdgeType;
  planVersionId: string;
}

export interface CanonicalStrategyTreeNode extends CanonicalStrategyNode {
  relationshipFromParent: CanonicalStrategyEdgeType | null;
  children: CanonicalStrategyTreeNode[];
}

export interface CanonicalHierarchyFilters {
  search: string;
  type: CanonicalStrategyNodeType | "all";
  state: CanonicalStrategyNodeState | "all";
}

export interface ChildRelationship {
  type: CanonicalStrategyNodeType;
  edgeType: CanonicalStrategyEdgeType;
}

export const CANONICAL_NODE_TYPE_LABELS: Record<CanonicalStrategyNodeType, string> = {
  corporate_strategy: "Corporate Strategy",
  theme: "Theme",
  objective: "Objective",
  strategic_play: "Strategic Play",
  portfolio: "Portfolio",
  area_of_focus: "Area of Focus",
};

export const CANONICAL_STATE_LABELS: Record<CanonicalStrategyNodeState, string> = {
  draft: "Draft",
  active: "Active",
  retired: "Retired",
};

export const CANONICAL_RELATIONSHIP_LABELS: Record<CanonicalStrategyEdgeType, string> = {
  contains: "Contains",
  executed_by: "Executed by",
  belongs_to_portfolio: "Belongs to portfolio",
  aligns_to: "Aligns to",
};

export const ROOT_NODE_TYPES: readonly CanonicalStrategyNodeType[] = ["corporate_strategy"];

const CHILD_RELATIONSHIPS: Record<CanonicalStrategyNodeType, readonly ChildRelationship[]> = {
  corporate_strategy: [{ type: "theme", edgeType: "contains" }],
  theme: [{ type: "objective", edgeType: "contains" }],
  objective: [{ type: "strategic_play", edgeType: "executed_by" }],
  strategic_play: [
    { type: "portfolio", edgeType: "belongs_to_portfolio" },
    { type: "area_of_focus", edgeType: "aligns_to" },
  ],
  portfolio: [],
  area_of_focus: [],
};

const TYPE_ORDER: Record<CanonicalStrategyNodeType, number> = {
  corporate_strategy: 0,
  theme: 1,
  objective: 2,
  strategic_play: 3,
  portfolio: 4,
  area_of_focus: 5,
};

export function getAllowedChildRelationships(type: CanonicalStrategyNodeType): readonly ChildRelationship[] {
  return CHILD_RELATIONSHIPS[type];
}

export function relationshipForChild(
  parentType: CanonicalStrategyNodeType,
  childType: CanonicalStrategyNodeType,
): CanonicalStrategyEdgeType | null {
  return CHILD_RELATIONSHIPS[parentType].find((relationship) => relationship.type === childType)?.edgeType ?? null;
}

function compareNodes(a: CanonicalStrategyNode, b: CanonicalStrategyNode): number {
  const typeDifference = TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  if (typeDifference !== 0) return typeDifference;
  return a.nameEn.localeCompare(b.nameEn);
}

export function buildCanonicalForest(
  nodes: readonly CanonicalStrategyNode[],
  edges: readonly CanonicalStrategyEdge[],
): CanonicalStrategyTreeNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, CanonicalStrategyEdge[]>();
  const incoming = new Set<string>();

  for (const edge of edges) {
    if (!byId.has(edge.fromNodeId) || !byId.has(edge.toNodeId)) continue;
    const bucket = outgoing.get(edge.fromNodeId) ?? [];
    bucket.push(edge);
    outgoing.set(edge.fromNodeId, bucket);
    incoming.add(edge.toNodeId);
  }

  const attach = (
    node: CanonicalStrategyNode,
    relationshipFromParent: CanonicalStrategyEdgeType | null,
    path: ReadonlySet<string>,
  ): CanonicalStrategyTreeNode => {
    const nextPath = new Set(path);
    nextPath.add(node.id);

    const children = (outgoing.get(node.id) ?? [])
      .map((edge) => ({ edge, node: byId.get(edge.toNodeId) }))
      .filter((entry): entry is { edge: CanonicalStrategyEdge; node: CanonicalStrategyNode } => Boolean(entry.node))
      .filter((entry) => !nextPath.has(entry.node.id))
      .sort((a, b) => compareNodes(a.node, b.node))
      .map((entry) => attach(entry.node, entry.edge.edgeType, nextPath));

    return { ...node, relationshipFromParent, children };
  };

  const roots = nodes.filter((node) => !incoming.has(node.id)).sort(compareNodes);
  return roots.map((root) => attach(root, null, new Set<string>()));
}

export function collectCanonicalTreeIds(forest: readonly CanonicalStrategyTreeNode[]): string[] {
  const ids: string[] = [];
  const visit = (node: CanonicalStrategyTreeNode) => {
    ids.push(node.id);
    node.children.forEach(visit);
  };
  forest.forEach(visit);
  return ids;
}

export function filterCanonicalForest(
  forest: readonly CanonicalStrategyTreeNode[],
  filters: CanonicalHierarchyFilters,
): CanonicalStrategyTreeNode[] {
  const search = filters.search.trim().toLowerCase();

  const visit = (node: CanonicalStrategyTreeNode): CanonicalStrategyTreeNode | null => {
    const children = node.children
      .map(visit)
      .filter((child): child is CanonicalStrategyTreeNode => Boolean(child));

    const matchesSearch =
      !search ||
      node.nameEn.toLowerCase().includes(search) ||
      node.nameAr.toLowerCase().includes(search) ||
      CANONICAL_NODE_TYPE_LABELS[node.type].toLowerCase().includes(search);
    const matchesType = filters.type === "all" || node.type === filters.type;
    const matchesState = filters.state === "all" || node.state === filters.state;

    if ((matchesSearch && matchesType && matchesState) || children.length > 0) {
      return { ...node, children };
    }
    return null;
  };

  return forest.map(visit).filter((node): node is CanonicalStrategyTreeNode => Boolean(node));
}
