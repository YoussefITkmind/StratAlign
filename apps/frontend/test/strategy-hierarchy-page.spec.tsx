// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * Behavioural tests for the Strategy Hierarchy page: the tree/list render off
 * the real tree query, selecting a node opens the detail panel with its real
 * fields, and the Add Node modal sends the payload the backend mutation
 * expects rather than just closing on click.
 */

const hooks = vi.hoisted(() => ({
  createNode: vi.fn(),
  updateNode: vi.fn(),
  deleteNode: vi.fn(),
  draftDescription: vi.fn(),
  invalidate: vi.fn(),
  treeData: undefined as unknown,
  treeLoading: false,
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    useUtils: () => ({ strategyHierarchy: { tree: { invalidate: hooks.invalidate } } }),
    strategyHierarchy: {
      tree: { useQuery: () => ({ data: hooks.treeData, isLoading: hooks.treeLoading, isError: false }) },
      createNode: { useMutation: () => ({ mutateAsync: hooks.createNode }) },
      updateNode: { useMutation: () => ({ mutateAsync: hooks.updateNode }) },
      deleteNode: { useMutation: () => ({ mutateAsync: hooks.deleteNode }) },
      draftDescription: { useMutation: () => ({ mutateAsync: hooks.draftDescription, isPending: false }) },
    },
  },
}));

import StrategyHierarchyPage from "@/components/strategy/StrategyHierarchyPage";
import type { StrategyNode } from "@/types/strategy";

const child: StrategyNode = {
  id: "revenue",
  name: "Revenue & Growth",
  type: "perspective",
  status: "at-risk",
  progress: 58,
  owner: { initials: "SC", color: "bg-blue-500", name: "Sarah Chen" },
};

const rootNode: StrategyNode = {
  id: "plan-1",
  name: "Acme Corp 2025 Strategic Plan",
  type: "plan",
  status: "on-track",
  progress: 74,
  owner: { initials: "AM", color: "bg-indigo-500", name: "Alex Morgan" },
  budget: "$12.4M",
  startDate: "2025-01-01",
  endDate: "2025-12-01",
  description: "Our comprehensive corporate strategy.",
  linkedKpis: ["Revenue Growth", "Strategy Score"],
  activity: [{ id: "a1", message: "Progress updated to 74%", actor: "Alex Morgan", createdAt: new Date().toISOString() }],
  children: [child],
};

describe("StrategyHierarchyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hooks.treeData = rootNode;
    hooks.treeLoading = false;
  });

  afterEach(() => cleanup());

  it("renders the tree from the query and shows the total node count", () => {
    render(<StrategyHierarchyPage canManageStrategy={true} />);

    expect(screen.getByText("Acme Corp 2025 Strategic Plan")).toBeTruthy();
    expect(screen.getByText("Revenue & Growth")).toBeTruthy();
    expect(screen.getByText(/2 nodes/)).toBeTruthy();
  });

  it("opens the detail panel with the node's real fields when a row is clicked", () => {
    render(<StrategyHierarchyPage canManageStrategy={true} />);

    fireEvent.click(screen.getByText("Acme Corp 2025 Strategic Plan"));
    const panel = within(screen.getByTestId("node-detail-panel"));

    expect(panel.getByText("$12.4M")).toBeTruthy();
    expect(panel.getByText("Alex Morgan")).toBeTruthy();
    expect(panel.getByText("Revenue Growth")).toBeTruthy();
    expect(panel.getByText("On track")).toBeTruthy();
  });

  it("navigates to a child from the Structure tab", () => {
    render(<StrategyHierarchyPage canManageStrategy={true} />);

    fireEvent.click(screen.getByText("Acme Corp 2025 Strategic Plan"));
    const panel = within(screen.getByTestId("node-detail-panel"));
    fireEvent.click(panel.getByText("Structure"));
    fireEvent.click(screen.getByTestId(`structure-child-${child.id}`));

    expect(within(screen.getByTestId("node-detail-panel")).getByText("Strategic Theme")).toBeTruthy();
  });

  it("submits the Add Node form with the expected mutation payload", async () => {
    hooks.createNode.mockResolvedValue({ id: "new-node" });
    render(<StrategyHierarchyPage canManageStrategy={true} />);

    fireEvent.click(screen.getByRole("button", { name: /add node/i }));

    const dialog = within(screen.getByTestId("node-form-modal"));
    fireEvent.change(dialog.getByPlaceholderText("e.g. Improve Customer NPS"), {
      target: { value: "Drive Revenue Growth 40% YoY" },
    });
    fireEvent.change(dialog.getByPlaceholderText("e.g. Jane Doe"), {
      target: { value: "Sarah Chen" },
    });

    fireEvent.click(dialog.getByRole("button", { name: /^add node$/i }));

    await waitFor(() => expect(hooks.createNode).toHaveBeenCalledTimes(1));
    expect(hooks.createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        parentId: "plan-1",
        name: "Drive Revenue Growth 40% YoY",
        ownerName: "Sarah Chen",
      }),
    );
    await waitFor(() => expect(hooks.invalidate).toHaveBeenCalled());
  });

  it("shows an empty state instead of crashing when there is no data yet", () => {
    hooks.treeData = null;
    render(<StrategyHierarchyPage canManageStrategy={true} />);

    expect(screen.getByText("No strategy data yet.")).toBeTruthy();
  });
});
