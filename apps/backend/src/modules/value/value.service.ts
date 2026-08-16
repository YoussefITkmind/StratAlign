import {
  createActor,
  valueLifecycleMachine,
  VALUE_REALIZATION_WORKFLOW_DEFINITION,
  type ValueLifecycleEvent,
  type ValueLifecycleState,
  type ValueLifecycleSnapshot,
} from "@spm/machines";

import type { PrismaService } from "../../database/prisma.service";
import type { GovernanceService } from "../governance/governance.service";
import type { GovernanceEscalationService } from "../governance/governance-escalation.service";
import type { RulesService } from "../rules/rules.service";

type BenefitRow = {
  id: string;
  initiative_id: string;
  category_id: string;
  driver: string;
  owner_user_id: string;
  workflow_case_id: string | null;
  lifecycle_state: ValueLifecycleState;
  workflow_snapshot: unknown;
  created_at: Date;
  updated_at: Date;
};

type CheckinRow = {
  id: string;
  benefit_id: string;
  due_at: Date;
  completed_at: Date | null;
  months_post_delivery: number;
  realized_amount_at_checkin: string | null;
  escalation_case_id: string | null;
};

export class ValueOperationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ValueOperationError";
    this.code = code;
  }
}

function currency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new ValueOperationError("VALUE_INVALID_CURRENCY", "Currency must be a three-letter ISO code");
  }
  return normalized;
}

function addMonthsExact(date: Date, months: number): Date {
  const source = new Date(date);
  const year = source.getUTCFullYear();
  const month = source.getUTCMonth();
  const day = source.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + months + 1, 0)).getUTCDate();
  const result = new Date(source);
  result.setUTCDate(1);
  result.setUTCMonth(month + months);
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function json(value: unknown): string {
  return JSON.stringify(value);
}

export class ValueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
    private readonly governanceEscalation: GovernanceEscalationService,
    private readonly rules: RulesService,
  ) {}

  async listTaxonomy() {
    return this.prisma.$queryRawUnsafe<Array<{
      id: string; key: string; name_en: string; name_ar: string; created_at: Date;
    }>>(
      `SELECT id, key, name_en, name_ar, created_at FROM "value"."value_categories" ORDER BY key ASC`,
    );
  }

  async createTaxonomy(input: { key: string; nameEn: string; nameAr: string }) {
    const key = input.key.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(key)) {
      throw new ValueOperationError("VALUE_INVALID_CATEGORY", "Category key is invalid");
    }
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; key: string; name_en: string; name_ar: string; created_at: Date;
    }>>(
      `INSERT INTO "value"."value_categories" (key, name_en, name_ar)
       VALUES ($1, $2, $3)
       RETURNING id, key, name_en, name_ar, created_at`,
      key,
      input.nameEn.trim(),
      input.nameAr.trim(),
    );
    return rows[0];
  }

  async registerBenefit(input: {
    initiativeId: string;
    categoryId: string;
    driver: string;
    ownerUserId: string;
  }): Promise<BenefitRow> {
    const rows = await this.prisma.$queryRawUnsafe<BenefitRow[]>(
      `INSERT INTO "value"."benefits"
        (initiative_id, category_id, driver, owner_user_id, workflow_snapshot)
       VALUES ($1::uuid, $2::uuid, $3, $4, '{}'::jsonb)
       RETURNING *`,
      input.initiativeId,
      input.categoryId,
      input.driver.trim(),
      input.ownerUserId,
    );
    const benefit = rows[0];
    if (!benefit) throw new ValueOperationError("VALUE_REGISTER_FAILED", "Benefit was not created");

    const actor = createActor(valueLifecycleMachine, {
      input: {
        benefitId: benefit.id,
        approvalCaseId: null,
        baselineExists: false,
        realizedEntryCount: 0,
        stopReason: null,
      },
    });
    actor.start();
    await this.prisma.$executeRawUnsafe(
      `UPDATE "value"."benefits" SET workflow_snapshot = $2::jsonb WHERE id = $1::uuid`,
      benefit.id,
      json(actor.getPersistedSnapshot()),
    );
    await this.ensureWorkflowDefinition();
    return this.getBenefit(benefit.id);
  }

  async setBaseline(input: {
    benefitId: string;
    amount: number;
    currency: string;
    approvedAt?: Date;
  }) {
    const benefit = await this.getBenefit(input.benefitId);
    if (benefit.lifecycle_state !== "approved") {
      throw new ValueOperationError("VALUE_BASELINE_STATE", "Baseline can be set only after benefit approval");
    }
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; benefit_id: string; amount: string; currency: string; approved_at: Date; created_at: Date;
    }>>(
      `INSERT INTO "value"."benefit_baselines" (benefit_id, amount, currency, approved_at)
       VALUES ($1::uuid, $2::numeric, $3, $4)
       RETURNING id, benefit_id, amount::text, currency, approved_at, created_at`,
      input.benefitId,
      String(input.amount),
      currency(input.currency),
      input.approvedAt ?? new Date(),
    );
    return rows[0];
  }

  async bindFeed(input: { benefitId: string; bindingRef: string }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ benefit_id: string; binding_ref: string; created_at: Date }>>(
      `INSERT INTO "value"."benefit_feed_bindings" (benefit_id, binding_ref)
       VALUES ($1::uuid, $2)
       ON CONFLICT (benefit_id) DO UPDATE SET binding_ref = EXCLUDED.binding_ref
       RETURNING benefit_id, binding_ref, created_at`,
      input.benefitId,
      input.bindingRef.trim(),
    );
    return rows[0];
  }

  async recordState(input: {
    benefitId: string;
    state: "planned" | "inflight" | "realized";
    amount: number;
    currency: string;
    period: string;
    source: "manual" | "feed";
    lineageRef?: string | null;
  }) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; benefit_id: string; state: string; amount: string; currency: string;
      period: string; source: string; lineage_ref: string | null; created_at: Date;
    }>>(
      `INSERT INTO "value"."value_state_entries"
        (benefit_id, state, amount, currency, period, source, lineage_ref)
       VALUES ($1::uuid, $2::"value"."ValueEntryState", $3::numeric, $4, $5,
               $6::"value"."ValueEntrySource", $7)
       RETURNING id, benefit_id, state::text, amount::text, currency, period, source::text, lineage_ref, created_at`,
      input.benefitId,
      input.state,
      String(input.amount),
      currency(input.currency),
      input.period,
      input.source,
      input.lineageRef ?? null,
    );
    return rows[0];
  }

  async transition(input: {
    benefitId: string;
    event: "submit_for_approval" | "approval_granted" | "begin_validation" | "start_tracking" | "close";
    actorUserId: string;
    approvalParticipantId?: string;
    stopReason?: string | null;
    now?: Date;
  }) {
    let benefit = await this.getBenefit(input.benefitId);
    const facts = await this.getFacts(benefit.id);
    const actor = createActor(valueLifecycleMachine, {
      input: {
        benefitId: benefit.id,
        approvalCaseId: benefit.workflow_case_id,
        baselineExists: facts.baselineExists,
        realizedEntryCount: facts.realizedEntryCount,
        stopReason: null,
      },
      snapshot: benefit.workflow_snapshot as ValueLifecycleSnapshot,
    });
    actor.start();
    actor.send({
      type: "REFRESH_FACTS",
      baselineExists: facts.baselineExists,
      realizedEntryCount: facts.realizedEntryCount,
    });

    let event: ValueLifecycleEvent;
    let approvalCaseId = benefit.workflow_case_id;
    switch (input.event) {
      case "submit_for_approval": {
        if (!input.approvalParticipantId) {
          throw new ValueOperationError("VALUE_APPROVER_REQUIRED", "Approval participant is required");
        }
        const approvalCase = await this.governance.submitCase({
          entityType: "value_benefit",
          entityId: benefit.id,
          submittedBy: input.actorUserId,
          approvalParticipantId: input.approvalParticipantId,
          proposedChange: {
            before: null,
            after: {
              initiativeId: benefit.initiative_id,
              categoryId: benefit.category_id,
              driver: benefit.driver,
              ownerUserId: benefit.owner_user_id,
            },
            impactSummary: { lifecycle: "value_realization" },
          },
        });
        approvalCaseId = approvalCase.id;
        event = { type: "SUBMIT_FOR_APPROVAL", approvalCaseId };
        break;
      }
      case "approval_granted": {
        if (!approvalCaseId) {
          throw new ValueOperationError("VALUE_APPROVAL_CASE_REQUIRED", "Benefit has no approval case");
        }
        await this.governance.assertApproved({
          approvalCaseId,
          entityType: "value_benefit",
          entityId: benefit.id,
        });
        event = { type: "APPROVAL_GRANTED" };
        break;
      }
      case "begin_validation":
        event = { type: "BEGIN_VALIDATION" };
        break;
      case "start_tracking":
        event = { type: "START_TRACKING" };
        break;
      case "close":
        event = { type: "CLOSE", stopReason: input.stopReason ?? null };
        break;
    }

    const before = actor.getSnapshot().value;
    actor.send(event);
    const after = actor.getSnapshot().value;
    if (before === after) {
      if (input.event === "begin_validation" && !facts.baselineExists) {
        throw new ValueOperationError("VALUE_BASELINE_REQUIRED", "An approved baseline is required before validation");
      }
      if (input.event === "close" && facts.realizedEntryCount === 0) {
        throw new ValueOperationError("VALUE_REALIZED_REQUIRED", "At least one realized value entry is required before closure");
      }
      throw new ValueOperationError("VALUE_INVALID_TRANSITION", `Cannot apply ${input.event} from ${String(before)}`);
    }

    const persisted = actor.getPersistedSnapshot();
    const state = String(after) as ValueLifecycleState;
    await this.prisma.$executeRawUnsafe(
      `UPDATE "value"."benefits"
       SET workflow_case_id = $2::uuid, lifecycle_state = $3::"value"."ValueLifecycleState",
           workflow_snapshot = $4::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1::uuid`,
      benefit.id,
      approvalCaseId,
      state,
      json(persisted),
    );

    if (state === "closure") {
      await this.scheduleCheckins(benefit.id, input.now ?? new Date());
    }
    benefit = await this.getBenefit(benefit.id);
    return benefit;
  }

  async completeCheckin(input: { checkinId: string; realizedAmountAtCheckin: number; completedAt?: Date }) {
    const rows = await this.prisma.$queryRawUnsafe<CheckinRow[]>(
      `UPDATE "value"."checkins"
       SET completed_at = $2, realized_amount_at_checkin = $3::numeric
       WHERE id = $1::uuid AND completed_at IS NULL
       RETURNING id, benefit_id, due_at, completed_at, months_post_delivery,
                 realized_amount_at_checkin::text, escalation_case_id`,
      input.checkinId,
      input.completedAt ?? new Date(),
      String(input.realizedAmountAtCheckin),
    );
    if (!rows[0]) throw new ValueOperationError("VALUE_CHECKIN_NOT_OPEN", "Check-in is missing or already complete");
    return rows[0];
  }

  async createGateReview(input: {
    initiativeId: string;
    stage: "design" | "pilot" | "execute" | "scale" | "done";
    ruleKey: string;
    criteriaInput: unknown;
    createdBy: string;
  }) {
    const rule = await this.rules.getPublished(input.ruleKey);
    if (!rule || rule.ruleType !== "gate_criteria") {
      throw new ValueOperationError("VALUE_GATE_RULE_REQUIRED", "Published gate_criteria rule was not found");
    }
    const result = await this.rules.evaluate(rule.id, input.criteriaInput);
    const snapshot = {
      ruleId: rule.id,
      ruleKey: rule.ruleKey,
      ruleVersion: rule.version,
      ruleDocument: rule.document,
      input: input.criteriaInput,
      result,
      evaluatedAt: new Date().toISOString(),
    };
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string; initiative_id: string; stage: string; criteria_eval_snapshot: unknown;
      decision: string | null; decided_by: string | null; decided_at: Date | null; created_by: string; created_at: Date;
    }>>(
      `INSERT INTO "value"."gate_reviews"
        (initiative_id, stage, criteria_eval_snapshot, created_by)
       VALUES ($1::uuid, $2, $3::jsonb, $4)
       RETURNING *`,
      input.initiativeId,
      input.stage,
      json(snapshot),
      input.createdBy,
    );
    return rows[0];
  }

  /**
   * Compatibility path for Phase 5.1 callers. Phase 5.2's public API overrides
   * this in ValueManagementService and applies committee role + creator/requester
   * separation-of-duties before reaching the database. This method still opens
   * the same transaction-local DB capability so the structural trigger is never
   * bypassed by an ordinary UPDATE.
   */
  async decideGateReview(input: {
    gateReviewId: string;
    decision: "continue" | "intervene" | "stop";
    decidedBy: string;
    decidedAt?: Date;
  }) {
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('spm.gate_decision_authorized', 'on', true)`);
      return tx.$queryRawUnsafe<Array<{
        id: string; initiative_id: string; stage: string; criteria_eval_snapshot: unknown;
        decision: string | null; decided_by: string | null; decided_at: Date | null; created_by: string; created_at: Date;
      }>>(
        `UPDATE "value"."gate_reviews"
         SET decision = $2::"value"."GateDecision", decided_by = $3, decided_at = $4
         WHERE id = $1::uuid AND decision IS NULL AND created_by <> $3
         RETURNING *`,
        input.gateReviewId,
        input.decision,
        input.decidedBy,
        input.decidedAt ?? new Date(),
      );
    });
    if (!rows[0]) {
      throw new ValueOperationError("VALUE_GATE_DECISION_FORBIDDEN", "Gate review is decided already or requires a different decision maker");
    }
    return rows[0];
  }

  async listCheckins(benefitId: string): Promise<CheckinRow[]> {
    return this.prisma.$queryRawUnsafe<CheckinRow[]>(
      `SELECT id, benefit_id, due_at, completed_at, months_post_delivery,
              realized_amount_at_checkin::text, escalation_case_id
       FROM "value"."checkins" WHERE benefit_id = $1::uuid ORDER BY months_post_delivery ASC`,
      benefitId,
    );
  }

  async escalateOverdueCheckins(now = new Date()) {
    const overdue = await this.prisma.$queryRawUnsafe<Array<CheckinRow & {
      owner_user_id: string;
      original_submitter: string | null;
    }>>(
      `SELECT c.id, c.benefit_id, c.due_at, c.completed_at, c.months_post_delivery,
              c.realized_amount_at_checkin::text, c.escalation_case_id,
              b.owner_user_id, ac.submitted_by AS original_submitter
       FROM "value"."checkins" c
       JOIN "value"."benefits" b ON b.id = c.benefit_id
       LEFT JOIN "governance"."approval_cases" ac ON ac.id = b.workflow_case_id
       WHERE c.completed_at IS NULL AND c.due_at < $1 AND c.escalation_case_id IS NULL
       ORDER BY c.due_at ASC`,
      now,
    );
    const raised: Array<{ checkinId: string; escalationCaseId: string }> = [];
    for (const checkin of overdue) {
      const escalation = await this.governanceEscalation.raise({
        approvalCaseId: null,
        entityType: "value_checkin",
        entityId: checkin.id,
        reason: `Value realization check-in is overdue for benefit ${checkin.benefit_id}`,
        participant: checkin.owner_user_id,
        originalSubmitter: checkin.original_submitter,
      });
      const updated = await this.prisma.$executeRawUnsafe(
        `UPDATE "value"."checkins"
         SET escalation_case_id = $2::uuid
         WHERE id = $1::uuid AND escalation_case_id IS NULL`,
        checkin.id,
        escalation.id,
      );
      if (updated === 1) raised.push({ checkinId: checkin.id, escalationCaseId: escalation.id });
    }
    return raised;
  }

  protected async scheduleCheckins(benefitId: string, deliveredAt: Date) {
    for (const months of [3, 6, 12] as const) {
      await this.prisma.$executeRawUnsafe(
        `INSERT INTO "value"."checkins" (benefit_id, due_at, months_post_delivery)
         VALUES ($1::uuid, $2, $3)
         ON CONFLICT (benefit_id, months_post_delivery) DO NOTHING`,
        benefitId,
        addMonthsExact(deliveredAt, months),
        months,
      );
    }
  }

  private async ensureWorkflowDefinition(): Promise<void> {
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO "governance"."workflow_definitions" (key, version, definition)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (key, version) DO NOTHING`,
      VALUE_REALIZATION_WORKFLOW_DEFINITION.key,
      VALUE_REALIZATION_WORKFLOW_DEFINITION.version,
      json(VALUE_REALIZATION_WORKFLOW_DEFINITION),
    );
  }

  private async getBenefit(benefitId: string): Promise<BenefitRow> {
    const rows = await this.prisma.$queryRawUnsafe<BenefitRow[]>(
      `SELECT * FROM "value"."benefits" WHERE id = $1::uuid`,
      benefitId,
    );
    if (!rows[0]) throw new ValueOperationError("VALUE_BENEFIT_NOT_FOUND", "Benefit was not found");
    return rows[0];
  }

  private async getFacts(benefitId: string): Promise<{ baselineExists: boolean; realizedEntryCount: number }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ baseline_exists: boolean; realized_count: bigint }>>(
      `SELECT EXISTS(SELECT 1 FROM "value"."benefit_baselines" WHERE benefit_id = $1::uuid) AS baseline_exists,
              (SELECT COUNT(*) FROM "value"."value_state_entries" WHERE benefit_id = $1::uuid AND state = 'realized') AS realized_count`,
      benefitId,
    );
    return {
      baselineExists: rows[0]?.baseline_exists ?? false,
      realizedEntryCount: Number(rows[0]?.realized_count ?? 0),
    };
  }
}
