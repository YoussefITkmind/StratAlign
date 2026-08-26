// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const hooks = vi.hoisted(() => ({
  createProject: vi.fn(),
  initiativeList: vi.fn(),
  listCredentialUsers: vi.fn(),
  onSuccess: undefined as (() => void) | undefined,
  state: {
    createPending: false,
    createError: undefined as Error | undefined,
  },
}));

vi.mock("@/lib/trpc/client", () => ({
  trpc: {
    execution: {
      initiative: { list: { useQuery: () => hooks.initiativeList() } },
      project: {
        create: {
          useMutation: (opts: { onSuccess?: () => void }) => {
            hooks.onSuccess = opts.onSuccess;
            return {
              mutate: (input: unknown) => {
                hooks.createProject(input);
                if (!hooks.state.createError) hooks.onSuccess?.();
              },
              isPending: hooks.state.createPending,
              error: hooks.state.createError,
            };
          },
        },
      },
    },
    iam: { listCredentialUsers: { useQuery: () => hooks.listCredentialUsers() } },
  },
}));

import { CreateProjectModal } from "@/components/initiatives/CreateProjectModal";

const INITIATIVE_ID = "11111111-1111-4111-8111-111111111111";
const OWNER_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  hooks.onSuccess = undefined;
  hooks.state.createPending = false;
  hooks.state.createError = undefined;
  hooks.initiativeList.mockReturnValue({ data: [{ id: INITIATIVE_ID, nameEn: "CRM Platform Migration" }] });
  hooks.listCredentialUsers.mockReturnValue({ data: undefined, isLoading: false, isError: true });
});

afterEach(() => cleanup());

function fillRequiredFields(name = "Salesforce CPQ Integration") {
  fireEvent.change(screen.getByTestId("project-name"), { target: { value: name } });
  fireEvent.change(screen.getByTestId("project-owner"), { target: { value: OWNER_ID } });
}

describe("CreateProjectModal", () => {
  it("renders the modal title, subtitle, and a standalone default parent option", () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByRole("heading", { name: "Create Project" })).toBeTruthy();
    expect(screen.getByText("A concrete deliverable linked to an initiative")).toBeTruthy();
    const select = screen.getByTestId("project-parent-initiative") as HTMLSelectElement;
    expect(select.options[0].textContent).toBe("— None / Standalone —");
    expect(screen.getByText("CRM Platform Migration")).toBeTruthy();
  });

  it("disables the submit button until a project name is entered", () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    const button = screen.getByTestId("submit-new-project") as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    fireEvent.change(screen.getByTestId("project-name"), { target: { value: "Salesforce CPQ Integration" } });
    expect(button.disabled).toBe(false);
  });

  it("blocks submission and shows an inline error when the owner is blank", () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    fireEvent.change(screen.getByTestId("project-name"), { target: { value: "Salesforce CPQ Integration" } });
    fireEvent.click(screen.getByTestId("submit-new-project"));

    expect(hooks.createProject).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-create-error").textContent).toContain("Owner is required");
  });

  it("submits the real mutation with the expected payload, including priority and parent initiative, and closes on success", () => {
    const onCreated = vi.fn();
    render(<CreateProjectModal onClose={() => {}} onCreated={onCreated} />);

    fillRequiredFields();
    fireEvent.change(screen.getByTestId("project-parent-initiative"), { target: { value: INITIATIVE_ID } });
    fireEvent.click(screen.getByRole("button", { name: "Critical" }));
    fireEvent.click(screen.getByTestId("submit-new-project"));

    expect(hooks.createProject).toHaveBeenCalledWith(expect.objectContaining({
      name: "Salesforce CPQ Integration",
      ownerUserId: OWNER_ID,
      parentInitiativeId: INITIATIVE_ID,
      priority: "critical",
    }));
    expect(onCreated).toHaveBeenCalledTimes(1);
  });

  it("defaults to a standalone project (no parent initiative) and Medium priority when unchanged", () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    fillRequiredFields("Internal Tooling Cleanup");
    fireEvent.click(screen.getByTestId("submit-new-project"));

    expect(hooks.createProject).toHaveBeenCalledWith(expect.objectContaining({ parentInitiativeId: null, priority: "medium" }));
  });

  it("rejects an end date that precedes the start date without calling the mutation", () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    fillRequiredFields();
    fireEvent.change(screen.getByLabelText(/Start Date/), { target: { value: "2025-12-01" } });
    fireEvent.change(screen.getByLabelText(/End Date/), { target: { value: "2025-08-01" } });
    fireEvent.click(screen.getByTestId("submit-new-project"));

    expect(hooks.createProject).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-create-error").textContent).toContain("End date cannot be before the start date");
  });

  it("rejects an invalid Jira board URL without calling the mutation", () => {
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    fillRequiredFields();
    fireEvent.change(screen.getByPlaceholderText("Jira board URL"), { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByTestId("submit-new-project"));

    expect(hooks.createProject).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-create-error").textContent).toContain("Jira board URL");
  });

  it("keeps the modal open, shows the backend error, and preserves entered values on failure", () => {
    hooks.state.createError = new Error("A project with this name already exists.");
    const onCreated = vi.fn();
    render(<CreateProjectModal onClose={() => {}} onCreated={onCreated} />);
    fillRequiredFields();
    fireEvent.click(screen.getByTestId("submit-new-project"));

    expect(hooks.createProject).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId("project-create-error").textContent).toContain("A project with this name already exists.");
    expect((screen.getByTestId("project-name") as HTMLInputElement).value).toBe("Salesforce CPQ Integration");
  });

  it("calls onClose without submitting when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<CreateProjectModal onClose={onClose} onCreated={() => {}} />);
    fireEvent.change(screen.getByTestId("project-name"), { target: { value: "Should not be created" } });
    fireEvent.click(screen.getByText("Cancel"));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(hooks.createProject).not.toHaveBeenCalled();
  });

  it("shows real users in the Owner select once the directory is available", () => {
    hooks.listCredentialUsers.mockReturnValue({
      data: [{ id: "33333333-3333-4333-8333-333333333333", name: "Priya Nair" }],
      isLoading: false,
      isError: false,
    });
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    expect(screen.getByText("Priya Nair")).toBeTruthy();
  });

  it("disables the submit button and shows a loading label while the mutation is pending", () => {
    hooks.state.createPending = true;
    render(<CreateProjectModal onClose={() => {}} onCreated={() => {}} />);
    const button = screen.getByTestId("submit-new-project") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain("Creating");
  });
});
