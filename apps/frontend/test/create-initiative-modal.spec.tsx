// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const hooks = vi.hoisted(() => ({
  register: vi.fn(),
  nodes: vi.fn(),
  listCredentialUsers: vi.fn(),
  onSuccess: undefined as (() => void) | undefined,
  state: {
    registerPending: false,
    registerError: undefined as Error | undefined,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    strategy: { nodes: { useQuery: () => hooks.nodes() } },
    execution: {
      initiative: {
        register: {
          useMutation: (opts: { onSuccess?: () => void }) => {
            hooks.onSuccess = opts.onSuccess;
            return {
              mutate: (input: unknown) => {
                hooks.register(input);
                if (!hooks.state.registerError) hooks.onSuccess?.();
              },
              isPending: hooks.state.registerPending,
              error: hooks.state.registerError,
            };
          },
        },
      },
    },
    iam: { listCredentialUsers: { useQuery: () => hooks.listCredentialUsers() } },
  },
}));

import { CreateInitiativeModal } from "@/components/initiatives/CreateInitiativeModal";

const PLAY_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  hooks.onSuccess = undefined;
  hooks.state.registerPending = false;
  hooks.state.registerError = undefined;
  hooks.nodes.mockReturnValue({
    data: [{ id: PLAY_ID, type: "strategic_play", state: "active", nameEn: "Digital Growth" }],
  });
  hooks.listCredentialUsers.mockReturnValue({ data: undefined, isLoading: false, isError: true });
});

afterEach(() => cleanup());

function completeStep1() {
  fireEvent.change(screen.getByTestId("initiative-name-en"), { target: { value: "CRM Platform Migration" } });
  fireEvent.change(screen.getByTestId("initiative-name-ar"), { target: { value: "ترحيل منصة" } });
  fireEvent.click(screen.getByText("Next →"));
}

describe("CreateInitiativeModal", () => {
  it("shows the step indicator for step 1 of 3", () => {
    render(<CreateInitiativeModal onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText("Step 1 of 3: Basic Info")).toBeTruthy();
  });

  it("keeps Next disabled on step 1 until both names are filled", () => {
    render(<CreateInitiativeModal onClose={() => {}} onCreated={() => {}} />);
    expect((screen.getByText("Next →") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByTestId("initiative-name-en"), { target: { value: "CRM Platform Migration" } });
    fireEvent.change(screen.getByTestId("initiative-name-ar"), { target: { value: "ترحيل منصة" } });
    expect((screen.getByText("Next →") as HTMLButtonElement).disabled).toBe(false);
  });

  it("requires a strategic play before leaving step 2, and shows step 2 of 3: Details once past step 1", () => {
    render(<CreateInitiativeModal onClose={() => {}} onCreated={() => {}} />);
    completeStep1();
    expect(screen.getByText("Step 2 of 3: Details")).toBeTruthy();

    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByTestId("initiative-play-required-error")).toBeTruthy();
  });

  it("rejects an end date before the start date on step 2", () => {
    render(<CreateInitiativeModal onClose={() => {}} onCreated={() => {}} />);
    completeStep1();
    fireEvent.change(screen.getByTestId("initiative-play-select"), { target: { value: PLAY_ID } });
    fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2025-12-01" } });
    fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2025-08-01" } });
    fireEvent.click(screen.getByText("Next →"));

    expect(screen.getByTestId("initiative-date-range-error")).toBeTruthy();
  });

  it("preserves department, dates, and tags when moving forward then back", () => {
    render(<CreateInitiativeModal onClose={() => {}} onCreated={() => {}} />);
    completeStep1();
    fireEvent.change(screen.getByTestId("initiative-play-select"), { target: { value: PLAY_ID } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Engineering"), { target: { value: "Engineering" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Tech, Sales Ops, Data"), { target: { value: "Tech, Data" } });
    fireEvent.click(screen.getByText("Next →"));
    expect(screen.getByText("Step 3 of 3: Team & Budget")).toBeTruthy();

    fireEvent.click(screen.getByText("Back"));
    expect((screen.getByPlaceholderText("e.g. Engineering") as HTMLInputElement).value).toBe("Engineering");
    expect((screen.getByPlaceholderText("e.g. Tech, Sales Ops, Data") as HTMLInputElement).value).toBe("Tech, Data");
  });

  it("submits the real mutation with priority, department, dates, tags, and budget", () => {
    const onCreated = vi.fn();
    render(<CreateInitiativeModal onClose={() => {}} onCreated={onCreated} />);
    fireEvent.click(screen.getByRole("button", { name: "High" }));
    completeStep1();
    fireEvent.change(screen.getByTestId("initiative-play-select"), { target: { value: PLAY_ID } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Engineering"), { target: { value: "Engineering" } });
    fireEvent.change(screen.getByPlaceholderText("e.g. Tech, Sales Ops, Data"), { target: { value: "Tech, Data " } });
    fireEvent.click(screen.getByText("Next →"));
    fireEvent.change(screen.getByTestId("initiative-owner-id"), { target: { value: OWNER_ID } });
    fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "50000" } });
    fireEvent.click(screen.getByTestId("submit-new-initiative"));

    expect(hooks.register).toHaveBeenCalledWith(expect.objectContaining({
      nameEn: "CRM Platform Migration",
      nameAr: "ترحيل منصة",
      strategicPlayNodeId: PLAY_ID,
      ownerUserId: OWNER_ID,
      priority: "high",
      department: "Engineering",
      tags: ["Tech", "Data"],
      budgetAmount: 50000,
    }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("keeps the flow open and shows the backend error on failure", () => {
    hooks.state.registerError = new Error("Only an owner of this strategic play may register an initiative");
    const onCreated = vi.fn();
    render(<CreateInitiativeModal onClose={() => {}} onCreated={onCreated} />);
    completeStep1();
    fireEvent.change(screen.getByTestId("initiative-play-select"), { target: { value: PLAY_ID } });
    fireEvent.click(screen.getByText("Next →"));
    fireEvent.change(screen.getByTestId("initiative-owner-id"), { target: { value: OWNER_ID } });
    fireEvent.click(screen.getByTestId("submit-new-initiative"));

    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId("initiative-register-error").textContent).toContain("Only an owner of this strategic play");
  });

  it("closes without submitting when Cancel is clicked on step 1", () => {
    const onClose = vi.fn();
    render(<CreateInitiativeModal onClose={onClose} onCreated={() => {}} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hooks.register).not.toHaveBeenCalled();
  });
});
