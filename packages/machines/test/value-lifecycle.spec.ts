import { createActor } from "xstate";
import { describe, expect, it } from "vitest";

import { valueLifecycleMachine } from "../src/value-lifecycle";

function actor(input?: Partial<{
  baselineExists: boolean;
  realizedEntryCount: number;
}>) {
  const service = createActor(valueLifecycleMachine, {
    input: {
      benefitId: "benefit-1",
      approvalCaseId: null,
      baselineExists: input?.baselineExists ?? false,
      realizedEntryCount: input?.realizedEntryCount ?? 0,
      stopReason: null,
    },
  });
  service.start();
  return service;
}

describe("value lifecycle machine", () => {
  it("uses an external generic ApprovalCase for the pending approval step", () => {
    const service = actor();

    service.send({ type: "SUBMIT_FOR_APPROVAL", approvalCaseId: "approval-123" });
    expect(service.getSnapshot().value).toBe("pending_approval");
    expect(service.getSnapshot().context.approvalCaseId).toBe("approval-123");

    service.send({ type: "APPROVAL_GRANTED" });
    expect(service.getSnapshot().value).toBe("approved");
  });

  it("does not leave approved until a baseline exists", () => {
    const service = actor();
    service.send({ type: "SUBMIT_FOR_APPROVAL", approvalCaseId: "approval-123" });
    service.send({ type: "APPROVAL_GRANTED" });

    service.send({ type: "BEGIN_VALIDATION" });
    expect(service.getSnapshot().value).toBe("approved");

    service.send({
      type: "REFRESH_FACTS",
      baselineExists: true,
      realizedEntryCount: 0,
    });
    service.send({ type: "BEGIN_VALIDATION" });
    expect(service.getSnapshot().value).toBe("validation");
  });

  it("does not close tracking until at least one realized value entry exists", () => {
    const service = actor({ baselineExists: true });
    service.send({ type: "SUBMIT_FOR_APPROVAL", approvalCaseId: "approval-123" });
    service.send({ type: "APPROVAL_GRANTED" });
    service.send({ type: "BEGIN_VALIDATION" });
    service.send({ type: "START_TRACKING" });
    expect(service.getSnapshot().value).toBe("tracking");

    service.send({ type: "CLOSE" });
    expect(service.getSnapshot().value).toBe("tracking");

    service.send({
      type: "REFRESH_FACTS",
      baselineExists: true,
      realizedEntryCount: 1,
    });
    service.send({ type: "CLOSE" });
    expect(service.getSnapshot().value).toBe("closure");
  });
});
