import {
  createActor,
  valueLifecycleMachine,
  type ValueLifecycleSnapshot,
} from "@spm/machines";

import type { PrismaService } from "../../database/prisma.service";
import type { InitiativeStageChangedPayload } from "../execution/execution-stage.events";
import type { GovernanceService } from "../governance/governance.service";
import type { RulesService } from "../rules/rules.service";
import { VALUE_GATE_RULE_LIBRARY } from "./value-gate-rules";

export type GateDecision = "continue" | "intervene" | "stop";
export type GateEvidenceKind = "document" | "kpi" | "benefit" | "commentary";

export class ValueGateError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ValueGateError";
    this.code = code;
  }
}

type GateRow = {
  id: string;
  initiative_id: string;
  from_stage: string | null;
  stage: string;
  criteria_eval_snapshot: unknown;
  decision: GateDecision | null;
  decided_by: string | null;
  decided_at: Date | null;
  created_by: string;
  approval_case_id: string | null;
  transition_dedupe_key: string | null;
  created_at: Date;
};

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asJson(value: unknown): string {
  return JSON.stringify(value);
}

export class ValueGateCore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly governance: GovernanceService,
    private readonly rules: RulesService,
  ) {}

  async createPendingFromStageTransition(
    payload: InitiativeStageChangedPayload,
  ): Promise<GateRow> {
    const transitionKey = `value-gate:${payload.initiativeId}:${payload.fromStage}-to-${payload.toStage}`;
    let gate = await this.findByTransitionKey(transitionKey);

    if (!gate) {
      const rows = await this.prisma.$queryRawUnsafe<GateRow[]>(
        `INSERT INTO "value"."gate_reviews"
          (initiative_id, from_stage, stage, criteria_eval_snapshot, created_by, transition_dedupe_key)
         VALUES ($1::uuid, $2, $3, '{"status":"pending"}'::jsonb, $4, $5)
         ON CONFLICT (transition_dedupe_key) DO NOTHING
         RETURNING *`,
        payload.initiativeId,
        payload.fromStage,
        payload.toStage,
        payload.requestedBy,
        transitionKey,
      );
      gate = rows[0] ?? await this.findByTransitionKey(transitionKey);
    }
    if (!gate) {
      throw new ValueGateError("VALUE_GATE_CREATE_FAILED", "Pending gate review could not be created");
    }

    if (!gate.approval_case_id) {
      const existingCase = await this.governance.getLatestCaseForEntity("value_gate_review", gate.id);
      let approvalCaseId = existingCase?.id ?? null;

      if (!approvalCaseId) {
        const committeeUserId = await this.findCommitteeAssignee([
          payload.requestedBy,
          payload.initiativeCreatedBy,
        ]);
        if (!committeeUserId) {
          throw new ValueGateError(
            "VALUE_GATE_COMMITTEE_UNAVAILABLE",
            "A governance committee member must be assigned before the stage gate can enter the Approval Tray",
          );
        }

        const approvalCase = await this.governance.submitCase({
          entityType: "value_gate_review",
          entityId: gate.id,
          submittedBy: payload.requestedBy,
          approvalParticipantId: committeeUserId,
          proposedChange: {
            before: {
              initiativeId: payload.initiativeId,
              stage: payload.fromStage,
            },
            after: {
              initiativeId: payload.initiativeId,
              stage: payload.toStage,
              gateReviewId: gate.id,
              criteriaStatus: "pending",
            },
            impactSummary: {
              capability: "value_gate",
              decisionOptions: ["continue", "intervene", "stop"],
              automaticAdvance: false,
            },
          },
        });
        approvalCaseId = approvalCase.id;
      }

      const rows = await this.prisma.$queryRawUnsafe<GateRow[]>(
        `UPDATE "value"."gate_reviews"
         SET approval_case_id = $2::uuid
         WHERE id = $1::uuid AND approval_case_id IS NULL
         RETURNING *`,
        gate.id,
        approvalCaseId,
      );
      gate = rows[0] ?? gate;
    }

    return gate;
  }

  async evaluateCriteria(gateReviewId: string, actorUserId: string): Promise<GateRow> {
    const gate = await this.getGate(gateReviewId);
    if (gate.decision) {
      throw new ValueGateError("VALUE_GATE_ALREADY_DECIDED", "A decided gate cannot be re-evaluated");
    }
    const current = asRecord(gate.criteria_eval_snapshot);
    if (current.status === "evaluated") {
      return gate;
    }

    const facts = await this.buildFacts(gate.initiative_id);
    const evaluations: unknown[] = [];
    let passed = true;

    for (const definition of VALUE_GATE_RULE_LIBRARY) {
      let rule = await this.rules.getPublished(definition.key);
      if (!rule) {
        try {
          const draft = await this.rules.createDraft({
            ruleKey: definition.key,
            name: definition.name,
            document: definition.document,
            createdBy: actorUserId,
          });
          rule = await this.rules.publish(draft.id);
        } catch {
          rule = await this.rules.getPublished(definition.key);
        }
      }
      if (!rule) {
        throw new ValueGateError("VALUE_GATE_RULE_REQUIRED", `Published gate rule ${definition.key} is unavailable`);
      }

      const result = await this.rules.evaluate(rule.id, { facts });
      const resultPassed = typeof result === "object" && result !== null && "passed" in result
        ? (result as { passed: boolean }).passed
        : false;
      passed = passed && resultPassed;
      evaluations.push({
        ruleId: rule.id,
        ruleKey: rule.ruleKey,
        ruleVersion: rule.version,
        ruleDocument: rule.document,
        result,
      });
    }

    const snapshot = {
      status: "evaluated",
      facts,
      passed,
      rules: evaluations,
      evaluatedAt: new Date().toISOString(),
    };
    const rows = await this.prisma.$queryRawUnsafe<GateRow[]>(
      `UPDATE "value"."gate_reviews"
       SET criteria_eval_snapshot = $2::jsonb
       WHERE id = $1::uuid
         AND decision IS NULL
         AND COALESCE(criteria_eval_snapshot->>'status', 'evaluated') = 'pending'
       RETURNING *`,
      gateReviewId,
      asJson(snapshot),
    );
    if (!rows[0]) {
      return this.getGate(gateReviewId);
    }
    return rows[0];
  }

  async attachEvidence(input: {
    gateReviewId: string;
    kind: GateEvidenceKind;
    reference: string;
    label?: string | null;
    attachedBy: string;
  }) {
    await this.getGate(input.gateReviewId);
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      gate_review_id: string;
      kind: GateEvidenceKind;
      reference: string;
      label: string | null;
      attached_by: string;
      created_at: Date;
    }>>(
      `INSERT INTO "value"."gate_review_evidence"
        (gate_review_id, kind, reference, label, attached_by)
       VALUES ($1::uuid, $2::"value"."GateEvidenceKind", $3, $4, $5)
       RETURNING *`,
      input.gateReviewId,
      input.kind,
      input.reference.trim(),
      input.label?.trim() || null,
      input.attachedBy,
    );
    return rows[0];
  }

  async listEvidence(gateReviewId: string) {
    await this.getGate(gateReviewId);
    return this.prisma.$queryRawUnsafe<Array<{
      id: string;
      gate_review_id: string;
      kind: GateEvidenceKind;
      reference: string;
      label: string | null;
      attached_by: string;
      created_at: Date;
    }>>(
      `SELECT * FROM "value"."gate_review_evidence"
       WHERE gate_review_id = $1::uuid ORDER BY created_at ASC, id ASC`,
      gateReviewId,
    );
  }

  async decide(input: {
    gateReviewId: string;
    decision: GateDecision;
    decidedBy: string;
    decidedAt?: Date;
  }): Promise<GateRow> {
    const gate = await this.getGateWithInitiative(input.gateReviewId);
    if (gate.decision) {
      throw new ValueGateError("VALUE_GATE_DECISION_FORBIDDEN", "Gate review has already been decided");
    }
    const snapshot = asRecord(gate.criteria_eval_snapshot);
    if (snapshot.status !== "evaluated") {
      throw new ValueGateError("VALUE_GATE_CRITERIA_REQUIRED", "Gate criteria must be evaluated before a committee decision");
    }
    const initiativeCreator = gate.initiative_created_by ?? gate.initiative_owner_user_id;
    if (input.decidedBy === gate.created_by || input.decidedBy === initiativeCreator) {
      throw new ValueGateError(
        "VALUE_GATE_SEPARATION_OF_DUTIES",
        "The committee decision maker must differ from both the initiative creator and the gate requester",
      );
    }

    if (gate.approval_case_id) {
      const approvalCase = await this.governance.getCase(gate.approval_case_id);
      if (approvalCase.currentState === "PENDING_APPROVAL") {
        await this.governance.transition({
          caseId: gate.approval_case_id,
          event: input.decision === "stop"
            ? { type: "REJECT", actorUserId: input.decidedBy, rationale: "Value Gate decision: stop" }
            : { type: "APPROVE", actorUserId: input.decidedBy, rationale: `Value Gate decision: ${input.decision}` },
        });
      }
    }

    const stoppedBenefitCases: string[] = [];
    const decided = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(hashtext($1))`, `value.gate:${input.gateReviewId}`);
      const latest = await tx.$queryRawUnsafe<GateRow[]>(
        `SELECT * FROM "value"."gate_reviews" WHERE id = $1::uuid FOR UPDATE`,
        input.gateReviewId,
      );
      if (!latest[0] || latest[0].decision) {
        throw new ValueGateError("VALUE_GATE_DECISION_FORBIDDEN", "Gate review has already been decided");
      }

      await tx.$executeRawUnsafe(`SELECT set_config('spm.gate_decision_authorized', 'on', true)`);
      const rows = await tx.$queryRawUnsafe<GateRow[]>(
        `UPDATE "value"."gate_reviews"
         SET decision = $2::"value"."GateDecision", decided_by = $3, decided_at = $4
         WHERE id = $1::uuid AND decision IS NULL
         RETURNING *`,
        input.gateReviewId,
        input.decision,
        input.decidedBy,
        input.decidedAt ?? new Date(),
      );
      const row = rows[0];
      if (!row) throw new ValueGateError("VALUE_GATE_DECISION_FORBIDDEN", "Gate review decision was not applied");

      if (input.decision === "intervene") {
        await tx.$executeRawUnsafe(
          `INSERT INTO "value"."gate_corrective_action_requirements"
            (gate_review_id, initiative_id, required_by)
           VALUES ($1::uuid, $2::uuid, $3)
           ON CONFLICT (gate_review_id) DO NOTHING`,
          row.id,
          row.initiative_id,
          gate.initiative_owner_user_id,
        );
      }

      if (input.decision === "stop") {
        await tx.$executeRawUnsafe(
          `UPDATE "execution"."initiatives"
           SET stage = 'done'::"execution"."InitiativeStage", updated_at = CURRENT_TIMESTAMP
           WHERE id = $1::uuid`,
          row.initiative_id,
        );
        const benefits = await tx.$queryRawUnsafe<Array<{
          id: string;
          workflow_case_id: string | null;
          workflow_snapshot: unknown;
        }>>(
          `SELECT id, workflow_case_id, workflow_snapshot
           FROM "value"."benefits"
           WHERE initiative_id = $1::uuid AND lifecycle_state <> 'closure'`,
          row.initiative_id,
        );
        for (const benefit of benefits) {
          const actor = createActor(valueLifecycleMachine, {
            input: {
              benefitId: benefit.id,
              approvalCaseId: benefit.workflow_case_id,
              baselineExists: false,
              realizedEntryCount: 0,
              stopReason: null,
            },
            snapshot: benefit.workflow_snapshot as ValueLifecycleSnapshot,
          });
          actor.start();
          actor.send({ type: "STOP", stopReason: `Value Gate ${row.id} stopped initiative ${row.initiative_id}` });
          if (actor.getSnapshot().value !== "closure") {
            throw new ValueGateError("VALUE_GATE_STOP_FAILED", `Benefit ${benefit.id} could not be closed`);
          }
          await tx.$executeRawUnsafe(
            `UPDATE "value"."benefits"
             SET lifecycle_state = 'closure', workflow_snapshot = $2::jsonb, updated_at = CURRENT_TIMESTAMP
             WHERE id = $1::uuid`,
            benefit.id,
            asJson(actor.getPersistedSnapshot()),
          );
          if (benefit.workflow_case_id) stoppedBenefitCases.push(benefit.workflow_case_id);
        }
      }

      return row;
    });

    if (input.decision === "stop") {
      for (const caseId of stoppedBenefitCases) {
        const approvalCase = await this.governance.getCase(caseId).catch(() => null);
        if (approvalCase?.currentState === "PENDING_APPROVAL") {
          await this.governance.transition({
            caseId,
            event: {
              type: "REJECT",
              actorUserId: input.decidedBy,
              rationale: `Closed because Value Gate ${input.gateReviewId} stopped the initiative`,
            },
          });
        }
      }
    }

    return decided;
  }

  async getCorrectiveActionRequirement(gateReviewId: string) {
    const rows = await this.prisma.$queryRawUnsafe<Array<{
      id: string;
      gate_review_id: string;
      initiative_id: string;
      required_by: string;
      status: string;
      commentary_ref: string | null;
      created_at: Date;
      resolved_at: Date | null;
    }>>(
      `SELECT * FROM "value"."gate_corrective_action_requirements" WHERE gate_review_id = $1::uuid`,
      gateReviewId,
    );
    return rows[0] ?? null;
  }

  private async findCommitteeAssignee(excludedUserIds: string[]): Promise<string | null> {
    const rows = await this.prisma.$queryRawUnsafe<Array<{ user_id: string }>>(
      `SELECT DISTINCT sg.user_id
       FROM "iam"."scope_grants" sg
       JOIN "iam"."roles" r ON r.id = sg.role_id
       WHERE r.name = 'governance_committee'
         AND NOT (sg.user_id = ANY($1::text[]))
       ORDER BY sg.user_id ASC
       LIMIT 1`,
      excludedUserIds,
    );
    return rows[0]?.user_id ?? null;
  }

  private async buildFacts(initiativeId: string) {
    const counts = await this.prisma.$queryRawUnsafe<Array<{
      benefit_count: bigint;
      baseline_count: bigint;
      open_critical_risk: boolean;
      value_variance_pct: string;
    }>>(
      `WITH benefit_values AS (
         SELECT b.id,
                bb.amount::numeric AS baseline,
                COALESCE(SUM(v.amount) FILTER (WHERE v.state = 'realized'), 0)::numeric AS realized
         FROM "value"."benefits" b
         LEFT JOIN "value"."benefit_baselines" bb ON bb.benefit_id = b.id
         LEFT JOIN "value"."value_state_entries" v ON v.benefit_id = b.id
         WHERE b.initiative_id = $1::uuid
         GROUP BY b.id, bb.amount
       )
       SELECT
         (SELECT count(*) FROM benefit_values)::bigint AS benefit_count,
         (SELECT count(*) FROM benefit_values WHERE baseline IS NOT NULL)::bigint AS baseline_count,
         EXISTS (
           SELECT 1 FROM "execution"."risk_indicators"
           WHERE initiative_id = $1::uuid AND level = 'high'
         ) AS open_critical_risk,
         COALESCE((
           SELECT MAX(
             CASE
               WHEN baseline IS NULL THEN 100
               WHEN baseline = 0 AND realized = 0 THEN 0
               WHEN baseline = 0 THEN 100
               ELSE ABS(realized - baseline) / ABS(baseline) * 100
             END
           ) FROM benefit_values
         ), 0)::text AS value_variance_pct`,
      initiativeId,
    );
    const row = counts[0];
    const benefitCount = Number(row?.benefit_count ?? 0);
    const baselineCount = Number(row?.baseline_count ?? 0);
    return {
      benefitBaselineExists: benefitCount > 0 && baselineCount === benefitCount,
      openCriticalRisk: row?.open_critical_risk ?? false,
      valueVariancePct: Number(row?.value_variance_pct ?? 0),
    };
  }

  private async findByTransitionKey(key: string): Promise<GateRow | null> {
    const rows = await this.prisma.$queryRawUnsafe<GateRow[]>(
      `SELECT * FROM "value"."gate_reviews" WHERE transition_dedupe_key = $1`,
      key,
    );
    return rows[0] ?? null;
  }

  private async getGate(gateReviewId: string): Promise<GateRow> {
    const rows = await this.prisma.$queryRawUnsafe<GateRow[]>(
      `SELECT * FROM "value"."gate_reviews" WHERE id = $1::uuid`,
      gateReviewId,
    );
    if (!rows[0]) throw new ValueGateError("VALUE_GATE_NOT_FOUND", "Gate review was not found");
    return rows[0];
  }

  private async getGateWithInitiative(gateReviewId: string): Promise<GateRow & {
    initiative_owner_user_id: string;
    initiative_created_by: string | null;
  }> {
    const rows = await this.prisma.$queryRawUnsafe<Array<GateRow & {
      initiative_owner_user_id: string;
      initiative_created_by: string | null;
    }>>(
      `SELECT g.*, i.owner_user_id AS initiative_owner_user_id, i.created_by AS initiative_created_by
       FROM "value"."gate_reviews" g
       JOIN "execution"."initiatives" i ON i.id = g.initiative_id
       WHERE g.id = $1::uuid`,
      gateReviewId,
    );
    if (!rows[0]) throw new ValueGateError("VALUE_GATE_NOT_FOUND", "Gate review was not found");
    return rows[0];
  }
}
