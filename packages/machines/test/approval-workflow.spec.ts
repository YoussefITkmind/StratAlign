import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_APPROVAL_WORKFLOW_DEFINITION,
  createApprovalActor,
  workflowMachineDefinitionSchema,
} from "../src";

const proposedChange = {
  before: { status: "draft" },
  after: { status: "published" },
  impactSummary: { affectedConsumers: 2 },
};

function actor(submittedBy = "submitter-user") {
  return createApprovalActor({
    context: {
      submittedBy,
      proposedChange,
    },
    separationOfDutiesCheck: (
      caseSubmitter,
      actingUser,
    ) => caseSubmitter !== actingUser,
  }).start();
}

describe("generic approval workflow", () => {
  it("stores a JSON-serializable versioned definition", () => {
    const serialized = JSON.stringify(
      DEFAULT_APPROVAL_WORKFLOW_DEFINITION,
    );

    const parsed = workflowMachineDefinitionSchema.parse(
      JSON.parse(serialized),
    );

    expect(parsed.key).toBe("generic_approval");
    expect(parsed.version).toBe(1);
    expect(parsed.initial).toBe("draft");

    expect(
      parsed.states.pending_approval.on?.APPROVE,
    ).toMatchObject({
      target: "approved",
      guard: "separationOfDuties",
    });
  });

  it("starts in draft", () => {
    const workflow = actor();

    expect(workflow.getSnapshot().value).toBe("draft");
  });

  it("moves draft -> pending_approval on SUBMIT", () => {
    const workflow = actor();

    workflow.send({
      type: "SUBMIT",
      actorUserId: "submitter-user",
    });

    expect(workflow.getSnapshot().value).toBe(
      "pending_approval",
    );
  });

  it("does not allow APPROVE directly from draft", () => {
    const workflow = actor();

    workflow.send({
      type: "APPROVE",
      actorUserId: "approver-user",
    });

    expect(workflow.getSnapshot().value).toBe("draft");
  });

  it("rejects self-approval through the named separation-of-duties guard", () => {
    const guard = vi.fn(
      (submittedBy: string, actorUserId: string) =>
        submittedBy !== actorUserId,
    );

    const workflow = createApprovalActor({
      context: {
        submittedBy: "same-user",
        proposedChange,
      },
      separationOfDutiesCheck: guard,
    }).start();

    workflow.send({
      type: "SUBMIT",
      actorUserId: "same-user",
    });

    workflow.send({
      type: "APPROVE",
      actorUserId: "same-user",
    });

    expect(guard).toHaveBeenCalledWith(
      "same-user",
      "same-user",
    );

    expect(workflow.getSnapshot().value).toBe(
      "pending_approval",
    );
  });

  it("allows a different user to approve", () => {
    const workflow = actor();

    workflow.send({
      type: "SUBMIT",
      actorUserId: "submitter-user",
    });

    workflow.send({
      type: "APPROVE",
      actorUserId: "approver-user",
      rationale: "Reviewed and approved",
    });

    expect(workflow.getSnapshot().value).toBe("approved");
    expect(workflow.getSnapshot().status).toBe("done");
  });

  it("allows a different user to reject", () => {
    const workflow = actor();

    workflow.send({
      type: "SUBMIT",
      actorUserId: "submitter-user",
    });

    workflow.send({
      type: "REJECT",
      actorUserId: "approver-user",
      rationale: "Insufficient evidence",
    });

    expect(workflow.getSnapshot().value).toBe("rejected");
    expect(workflow.getSnapshot().status).toBe("done");
  });

  it("supports changes requested and resubmission", () => {
    const workflow = actor();

    workflow.send({
      type: "SUBMIT",
      actorUserId: "submitter-user",
    });

    workflow.send({
      type: "REQUEST_CHANGES",
      actorUserId: "approver-user",
      rationale: "Update the thresholds",
    });

    expect(workflow.getSnapshot().value).toBe(
      "changes_requested",
    );

    workflow.send({
      type: "RESUBMIT",
      actorUserId: "submitter-user",
    });

    expect(workflow.getSnapshot().value).toBe(
      "pending_approval",
    );
  });

  it("can persist and restore an actor snapshot", () => {
    const first = actor();

    first.send({
      type: "SUBMIT",
      actorUserId: "submitter-user",
    });

    const persisted = first.getPersistedSnapshot();

    const restored = createApprovalActor({
      context: {
        submittedBy: "submitter-user",
        proposedChange,
      },
      separationOfDutiesCheck: (
        submittedBy,
        actorUserId,
      ) => submittedBy !== actorUserId,
      snapshot: persisted,
    }).start();

    expect(restored.getSnapshot().value).toBe(
      "pending_approval",
    );

    restored.send({
      type: "APPROVE",
      actorUserId: "different-user",
    });

    expect(restored.getSnapshot().value).toBe("approved");
  });
});
