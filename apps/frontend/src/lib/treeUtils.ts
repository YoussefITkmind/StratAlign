import type { StrategyNode, NodeType, NodeStatus } from "@/types/strategy";

export interface Filters {
  search: string;
  type: NodeType | "all";
  status: NodeStatus | "all";
}

export function isFiltering(filters: Filters): boolean {
  return filters.search.trim() !== "" || filters.type !== "all" || filters.status !== "all";
}

export function collectIds(node: StrategyNode): string[] {
  return [node.id, ...(node.children ?? []).flatMap(collectIds)];
}

export function flatten(node: StrategyNode, depth = 0): { node: StrategyNode; depth: number }[] {
  return [{ node, depth }, ...(node.children ?? []).flatMap((child) => flatten(child, depth + 1))];
}

export function findNode(node: StrategyNode, id: string): StrategyNode | null {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function matches(node: StrategyNode, filters: Filters): boolean {
  const query = filters.search.trim().toLowerCase();
  if (query && !node.name.toLowerCase().includes(query)) return false;
  if (filters.type !== "all" && node.type !== filters.type) return false;
  if (filters.status !== "all" && node.status !== filters.status) return false;
  return true;
}

/** Keeps a node if it (or any descendant) matches; returns null when nothing in the tree matches. */
export function filterTree(node: StrategyNode, filters: Filters): StrategyNode | null {
  if (!isFiltering(filters)) return node;

  const children = (node.children ?? [])
    .map((child) => filterTree(child, filters))
    .filter((child): child is StrategyNode => child !== null);

  if (matches(node, filters) || children.length > 0) {
    return { ...node, children };
  }
  return null;
}

export function addChild(node: StrategyNode, parentId: string, child: StrategyNode): StrategyNode {
  if (node.id === parentId) {
    return { ...node, children: [...(node.children ?? []), child] };
  }
  if (!node.children) return node;
  return { ...node, children: node.children.map((c) => addChild(c, parentId, child)) };
}
