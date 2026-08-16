import type { PrismaService } from "../../database/prisma.service";
import type { InitiativeStageChangedPayload } from "../execution/execution-stage.events";
import type { GovernanceService } from "../governance/governance.service";
import type { GovernanceEscalationService } from "../governance/governance-escalation.service";
import type { RulesService } from "../rules/rules.service";
import type { SchedulerService } from "../scheduler/scheduler.service";
import { ScheduledValueService } from "./scheduled-value.service";
import {
  ValueGateCore,
  type GateDecision,
  type GateEvidenceKind,
} from "./value-gate.core";

/**
 * Phase 5.2 facade: retains all Phase 5.1 benefit/check-in behavior from
 * ScheduledValueService while routing Value Gate operations through the
 * stricter committee-governed implementation.
 */
export class ValueManagementService extends ScheduledValueService {
  private readonly gates: ValueGateCore;

  constructor(
    prisma: PrismaService,
    governance: GovernanceService,
    governanceEscalation: GovernanceEscalationService,
    rules: RulesService,
    scheduler: SchedulerService,
  ) {
    super(prisma, governance, governanceEscalation, rules, scheduler);
    this.gates = new ValueGateCore(prisma, governance, rules);
  }

  async createPendingGateReviewFromTransition(payload: InitiativeStageChangedPayload) {
    return this.gates.createPendingFromStageTransition(payload);
  }

  async evaluateGateCriteria(input: { gateReviewId: string; actorUserId: string }) {
    return this.gates.evaluateCriteria(input.gateReviewId, input.actorUserId);
  }

  async attachGateEvidence(input: {
    gateReviewId: string;
    kind: GateEvidenceKind;
    reference: string;
    label?: string | null;
    attachedBy: string;
  }) {
    return this.gates.attachEvidence(input);
  }

  async listGateEvidence(gateReviewId: string) {
    return this.gates.listEvidence(gateReviewId);
  }

  override async decideGateReview(input: {
    gateReviewId: string;
    decision: GateDecision;
    decidedBy: string;
    decidedAt?: Date;
  }) {
    return this.gates.decide(input);
  }

  async getGateCorrectiveActionRequirement(gateReviewId: string) {
    return this.gates.getCorrectiveActionRequirement(gateReviewId);
  }
}
