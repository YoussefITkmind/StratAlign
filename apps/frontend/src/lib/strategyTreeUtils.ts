import type { NodeType, NodeState } from "@/lib/strategyHierarchyConfig";

export interface HierarchyNode {
  id: string;
  type: NodeType;
  nameEn: string;
  nameAr: string;
  state: NodeState;
  owner: { initials: string; color: string };
  progress: number;
}

export interface HierarchyTreeNode extends HierarchyNode {
  children: HierarchyTreeNode[];
}

interface HierarchyEdge {
  fromNodeId: string;
  toNodeId: string;
  edgeType: string;
}

/** Assembles the flat node/edge lists the backend returns into a forest, nesting on "contains" edges (fromNodeId = parent). */
export function buildForest(nodes: HierarchyNode[], edges: HierarchyEdge[]): HierarchyTreeNode[] {
  const childIdsByParent = new Map<string, string[]>();
  const childIds = new Set<string>();
  for (const edge of edges) {
    if (edge.edgeType !== "contains") continue;
    const list = childIdsByParent.get(edge.fromNodeId) ?? [];
    list.push(edge.toNodeId);
    childIdsByParent.set(edge.fromNodeId, list);
    childIds.add(edge.toNodeId);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const build = (id: string, ancestry: Set<string>): HierarchyTreeNode | null => {
    const node = byId.get(id);
    if (!node || ancestry.has(id)) return null;
    const nextAncestry = new Set(ancestry).add(id);
    const children = (childIdsByParent.get(id) ?? [])
      .map((childId) => build(childId, nextAncestry))
      .filter((child): child is HierarchyTreeNode => child !== null);
    return { ...node, children };
  };

  const rootIds = nodes.filter((node) => !childIds.has(node.id)).map((node) => node.id);
  return rootIds
    .map((id) => build(id, new Set()))
    .filter((node): node is HierarchyTreeNode => node !== null);
}

export interface Filters {
  search: string;
  type: NodeType | "all";
  state: NodeState | "all";
}

export function isFiltering(filters: Filters): boolean {
  return filters.search.trim() !== "" || filters.type !== "all" || filters.state !== "all";
}

export function collectIds(node: HierarchyTreeNode): string[] {
  return [node.id, ...node.children.flatMap(collectIds)];
}

export function flatten(node: HierarchyTreeNode, depth = 0): { node: HierarchyTreeNode; depth: number }[] {
  return [{ node, depth }, ...node.children.flatMap((child) => flatten(child, depth + 1))];
}

function matches(node: HierarchyTreeNode, filters: Filters): boolean {
  const query = filters.search.trim().toLowerCase();
  if (query && !node.nameEn.toLowerCase().includes(query) && !node.nameAr.toLowerCase().includes(query)) return false;
  if (filters.type !== "all" && node.type !== filters.type) return false;
  if (filters.state !== "all" && node.state !== filters.state) return false;
  return true;
}

/** Keeps a node if it (or any descendant) matches the filters. */
function filterTree(node: HierarchyTreeNode, filters: Filters): HierarchyTreeNode | null {
  const children = node.children
    .map((child) => filterTree(child, filters))
    .filter((child): child is HierarchyTreeNode => child !== null);

  if (matches(node, filters) || children.length > 0) return { ...node, children };
  return null;
}

export function filterForest(forest: HierarchyTreeNode[], filters: Filters): HierarchyTreeNode[] {
  if (!isFiltering(filters)) return forest;
  return forest.map((node) => filterTree(node, filters)).filter((node): node is HierarchyTreeNode => node !== null);
}
