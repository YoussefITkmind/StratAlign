import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiSuggestionService } from "../../src/modules/ai/ai-suggestion.service";
import type { AcceptSuggestionInput } from "../../src/modules/ai/ai-suggestion.service";
import {
  AiAcceptInProgressError,
  AiDuplicateSuggestionError,
} from "../../src/modules/ai/ai.errors";
import { RegistryOperationError } from "../../src/modules/registry/registry.errors";
import { createLogger } from "../../src/logging/logger";
import type { ThemeSuggestionContext } from "../../src/modules/ai/ai-suggestion.types";

/**
 * Accept is where a proposal stops being advice and becomes a record. These
 * tests assert three things the design depends on: creation goes through the
 * registry's own services and nothing else, the accepted values are the edited
 * ones, and a replayed accept produces no second record.
 */

const THEME_ID = "11111111-1111-4111-8111-111111111111";
const OBJECTIVE_ID = "22222222-2222-4222-8222-222222222222";
const OUTSIDE_OBJECTIVE_ID = "66666666-6666-4666-8666-666666666666";
const SUGGESTION_ID = "33333333-3333-4333-8333-333333333333";
const GENERATION_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const CREATED_KPI_ID = "77777777-7777-4777-8777-777777777777";
const CREATED_OKR_ID = "88888888-8888-4888-8888-888888888888";

const context: ThemeSuggestionContext = {
  theme: { id: THEME_ID, nameEn: "Revenue & Growth", nameAr: "الإيرادات", type: "theme" },
  ancestry: [],
  objectives: [
    { id: OBJECTIVE_ID, nameEn: "Achieve $60M ARR", nameAr: "ARR", type: "objective" },
  ],
  existingOkrs: [
    {
      id: "okr-1",
      objectiveNodeId: OBJECTIVE_ID,
      nameEn: "Drive Revenue Growth 40% YoY",
      nameAr: "نمو",
      keyResults: [],
    },
  ],
  existingKpis: [],
};

const kpiInput: AcceptSuggestionInput = {
  suggestionId: SUGGESTION_ID,
  generationId: GENERATION_ID,
  themeNodeId: THEME_ID,
  kind: "kpi",
  titleEn: "LTV to CAC Ratio",
  titleAr: "نسبة",
  descriptionEn: "Acquisition efficiency.",
  descriptionAr: null,
  confidence: 0.91,
  provider: "anthropic",
  model: "claude-sonnet-5",
  edited: false,
  kpi: { unit: "x", frequency: "quarterly", polarity: "higher_is_better" },
  okr: null,
};

const okrInput: AcceptSuggestionInput = {
  ...kpiInput,
  kind: "okr",
  titleEn: "Expand into enterprise accounts",
  titleAr: "التوسع",
  kpi: null,
  okr: {
    objectiveNodeId: OBJECTIVE_ID,
    keyResults: [
      {
        titleEn: "Sign 20 enterprise logos",
        titleAr: "توقيع",
        type: "quantitative",
        targetValue: 20,
        unit: "logos",
      },
    ],
  },
};

/**
 * Prisma stand-in that models the one behaviour the claim protocol depends on:
 * `suggestion_id` is unique, so a second insert for the same proposal fails
 * with P2002 rather than succeeding.
 */
function makeProvenanceStore() {
  const rows = new Map<
    string,
    { subjectType: string; subjectId: string | null; edited: boolean }
  >();

  const create = vi.fn(({ data }: { data: Record<string, unknown> }) => {
    const suggestionId = data.suggestionId as string;

    if (rows.has(suggestionId)) {
      // Shape-compatible with a Prisma unique-constraint failure.
      return Promise.reject(
        Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
      );
    }

    rows.set(suggestionId, {
      subjectType: data.subjectType as string,
      subjectId: (data.subjectId as string | null) ?? null,
      edited: Boolean(data.edited),
    });
    return Promise.resolve({ id: `provenance-${suggestionId}` });
  });

  const findUnique = vi.fn(
    ({ where }: { where: { suggestionId: string } }) =>
      Promise.resolve(rows.get(where.suggestionId) ?? null),
  );

  const update = vi.fn(
    ({ where, data }: { where: { suggestionId: string }; data: { subjectId: string } }) => {
      const row = rows.get(where.suggestionId);
      if (!row) return Promise.reject(new Error("Record not found"));
      row.subjectId = data.subjectId;
      return Promise.resolve(row);
    },
  );

  const deleteMany = vi.fn(({ where }: { where: { suggestionId: string; subjectId: null } }) => {
    const row = rows.get(where.suggestionId);
    if (row && row.subjectId === null) {
      rows.delete(where.suggestionId);
      return Promise.resolve({ count: 1 });
    }
    return Promise.resolve({ count: 0 });
  });

  return { rows, create, findUnique, update, deleteMany };
}

function makeService() {
  const store = makeProvenanceStore();
  const publishWithin = vi.fn().mockResolvedValue(1);
  const nudgeRelay = vi.fn().mockResolvedValue(undefined);

  const prisma = {
    aiSuggestionProvenance: {
      findUnique: store.findUnique,
      create: store.create,
      update: store.update,
      deleteMany: store.deleteMany,
    },
    $transaction: vi.fn(
      async (work: (tx: unknown) => Promise<unknown>) =>
        work({ aiSuggestionProvenance: { update: store.update } }),
    ),
  };

  const createDraft = vi.fn().mockResolvedValue({
    definition: { id: CREATED_KPI_ID },
    version: { id: "version-1", version: 1 },
  });
  const findSimilar = vi.fn().mockResolvedValue([]);
  const createOkr = vi.fn().mockResolvedValue({ id: CREATED_OKR_ID, keyResults: [] });
  const setAlignments = vi.fn().mockResolvedValue([]);
  const build = vi.fn().mockResolvedValue(context);
  const createCadenceDefinition = vi.fn().mockResolvedValue({ id: "cadence-def-1" });
  const materializeCadence = vi.fn().mockResolvedValue({ created: 0, skipped: 0, nextOccurrenceAt: null });

  const service = new AiSuggestionService(
    prisma as never,
    { build } as never,
    { name: "anthropic", model: "claude-sonnet-5", isConfigured: true, complete: vi.fn() } as never,
    { createDraft, findSimilar } as never,
    { create: createOkr } as never,
    { set: setAlignments } as never,
    { publishWithin, nudgeRelay } as never,
    { createDefinition: createCadenceDefinition } as never,
    { materialize: materializeCadence } as never,
    createLogger("error"),
  );

  return {
    service,
    store,
    findUnique: store.findUnique,
    create: store.create,
    update: store.update,
    createDraft,
    findSimilar,
    createOkr,
    setAlignments,
    build,
    publishWithin,
    prisma,
  };
}

describe("accepting an AI suggestion", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("KPI", () => {
    it("creates a real KPI through the registry's own draft service", async () => {
      const { service, createDraft } = makeService();

      const result = await service.accept(kpiInput, ACTOR_ID);

      expect(createDraft).toHaveBeenCalledWith({
        nameEn: "LTV to CAC Ratio",
        nameAr: "نسبة",
        descriptionEn: "Acquisition efficiency.",
        descriptionAr: null,
        unit: "x",
        polarity: "higher_is_better",
        frequency: "quarterly",
        dataSourceType: "manual",
        ownerUserId: ACTOR_ID,
        activeFrom: expect.any(Date),
      });
      expect(result).toMatchObject({
        subjectType: "kpi_definition",
        subjectId: CREATED_KPI_ID,
        alreadyAccepted: false,
      });
    });

    it("stamps the authenticated actor as owner, ignoring anything in the payload", async () => {
      const { service, createDraft } = makeService();

      await service.accept(
        { ...kpiInput, ownerUserId: "attacker" } as never,
        ACTOR_ID,
      );

      expect(createDraft.mock.calls[0][0].ownerUserId).toBe(ACTOR_ID);
    });

    it("aligns the new KPI to the theme it was suggested for", async () => {
      const { service, setAlignments } = makeService();

      await service.accept(kpiInput, ACTOR_ID);

      expect(setAlignments).toHaveBeenCalledWith({
        kpiDefinitionId: CREATED_KPI_ID,
        alignments: [{ strategyNodeId: THEME_ID, alignmentType: "theme" }],
      });
    });

    it("refuses a candidate that collides with an existing KPI", async () => {
      const { service, findSimilar, createDraft } = makeService();
      findSimilar.mockResolvedValue([
        {
          kpiDefinitionId: "existing",
          kpiVersionId: "v",
          version: 1,
          status: "active",
          nameEn: "LTV:CAC Ratio",
          nameAr: "نسبة",
          similarity: 0.95,
          rank: 1,
          matchingFields: [],
        },
      ]);

      await expect(service.accept(kpiInput, ACTOR_ID)).rejects.toBeInstanceOf(
        AiDuplicateSuggestionError,
      );
      expect(createDraft).not.toHaveBeenCalled();
    });

    it("creates a flagged candidate once the reviewer acknowledges the collision", async () => {
      const { service, findSimilar, createDraft } = makeService();
      findSimilar.mockResolvedValue([
        {
          kpiDefinitionId: "existing",
          kpiVersionId: "v",
          version: 1,
          status: "active",
          nameEn: "LTV:CAC Ratio",
          nameAr: "نسبة",
          similarity: 0.95,
          rank: 1,
          matchingFields: [],
        },
      ]);

      await service.accept({ ...kpiInput, acknowledgeDuplicate: true }, ACTOR_ID);

      expect(createDraft).toHaveBeenCalledOnce();
    });

    it("lets a merely similar candidate through without acknowledgement", async () => {
      const { service, findSimilar, createDraft } = makeService();
      findSimilar.mockResolvedValue([
        {
          kpiDefinitionId: "existing",
          kpiVersionId: "v",
          version: 1,
          status: "active",
          nameEn: "Acquisition Cost",
          nameAr: "تكلفة",
          similarity: 0.52,
          rank: 1,
          matchingFields: [],
        },
      ]);

      await service.accept(kpiInput, ACTOR_ID);

      expect(createDraft).toHaveBeenCalledOnce();
    });
  });

  describe("OKR", () => {
    it("creates the OKR and its key results through the registry's OKR service", async () => {
      const { service, createOkr } = makeService();

      const result = await service.accept(okrInput, ACTOR_ID);

      expect(createOkr).toHaveBeenCalledWith({
        objectiveNodeId: OBJECTIVE_ID,
        nameEn: "Expand into enterprise accounts",
        nameAr: "التوسع",
        keyResults: [
          {
            type: "quantitative",
            targetValue: 20,
            unit: "logos",
            titleEn: "Sign 20 enterprise logos",
            titleAr: "توقيع",
          },
        ],
      });
      expect(result.subjectType).toBe("okr");
      expect(result.subjectId).toBe(CREATED_OKR_ID);
    });

    it("refuses an objective that is not under the selected theme", async () => {
      const { service, createOkr } = makeService();

      await expect(
        service.accept(
          { ...okrInput, okr: { ...okrInput.okr!, objectiveNodeId: OUTSIDE_OBJECTIVE_ID } },
          ACTOR_ID,
        ),
      ).rejects.toThrow("The objective is not part of the selected theme");
      expect(createOkr).not.toHaveBeenCalled();
    });

    it("refuses an OKR that arrives with no key results", async () => {
      const { service, createOkr } = makeService();

      await expect(
        service.accept(
          { ...okrInput, okr: { objectiveNodeId: OBJECTIVE_ID, keyResults: [] } },
          ACTOR_ID,
        ),
      ).rejects.toThrow("at least one key result");
      expect(createOkr).not.toHaveBeenCalled();
    });

    it("refuses an OKR restating one that already exists in the theme", async () => {
      const { service, createOkr } = makeService();

      await expect(
        service.accept(
          { ...okrInput, titleEn: "drive revenue growth 40% yoy" },
          ACTOR_ID,
        ),
      ).rejects.toBeInstanceOf(AiDuplicateSuggestionError);
      expect(createOkr).not.toHaveBeenCalled();
    });
  });

  describe("editing before accepting", () => {
    it("persists the edited values, not the ones the model proposed", async () => {
      const { service, createDraft } = makeService();

      await service.accept(
        {
          ...kpiInput,
          titleEn: "Increase enterprise ARR by 30%",
          kpi: { unit: "%", frequency: "monthly", polarity: "higher_is_better" },
          edited: true,
        },
        ACTOR_ID,
      );

      expect(createDraft.mock.calls[0][0]).toMatchObject({
        nameEn: "Increase enterprise ARR by 30%",
        unit: "%",
        frequency: "monthly",
      });
    });

    it("persists edited key-result targets", async () => {
      const { service, createOkr } = makeService();

      await service.accept(
        {
          ...okrInput,
          edited: true,
          okr: {
            objectiveNodeId: OBJECTIVE_ID,
            keyResults: [
              { ...okrInput.okr!.keyResults[0], targetValue: 35 },
            ],
          },
        },
        ACTOR_ID,
      );

      expect(createOkr.mock.calls[0][0].keyResults[0].targetValue).toBe(35);
    });

    it("still records an edited proposal as AI-originated", async () => {
      const { service, create } = makeService();

      const result = await service.accept({ ...kpiInput, edited: true }, ACTOR_ID);

      expect(result.edited).toBe(true);
      expect(create.mock.calls[0][0].data).toMatchObject({
        edited: true,
        provider: "anthropic",
        model: "claude-sonnet-5",
      });
    });

    it("runs edited values through the registry's validation, not around it", async () => {
      const { service, createDraft } = makeService();
      createDraft.mockRejectedValue(
        new RegistryOperationError("A unit is required"),
      );

      await expect(
        service.accept({ ...kpiInput, edited: true }, ACTOR_ID),
      ).rejects.toBeInstanceOf(RegistryOperationError);
    });
  });

  describe("provenance", () => {
    it("records what the proposal became, and who accepted it", async () => {
      const { service, create, update } = makeService();

      await service.accept(kpiInput, ACTOR_ID);

      // The claim goes in first, before the KPI exists, so the subject id is
      // filled in afterwards rather than supplied up front.
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          suggestionId: SUGGESTION_ID,
          generationId: GENERATION_ID,
          subjectType: "KPI_DEFINITION",
          subjectId: null,
          themeNodeId: THEME_ID,
          provider: "anthropic",
          model: "claude-sonnet-5",
          confidence: 0.91,
          edited: false,
          acceptedById: ACTOR_ID,
        }),
      });
      expect(update).toHaveBeenCalledWith({
        where: { suggestionId: SUGGESTION_ID },
        data: { subjectId: CREATED_KPI_ID },
      });
    });

    it("announces the acceptance on the outbox with a replay-safe key", async () => {
      const { service, publishWithin } = makeService();

      await service.accept(kpiInput, ACTOR_ID);

      expect(publishWithin).toHaveBeenCalledWith(expect.anything(), [
        expect.objectContaining({
          eventType: "registry.ai_suggestion.accepted",
          aggregateType: "KpiDefinition",
          aggregateId: CREATED_KPI_ID,
          dedupeKey: `registry.ai_suggestion.accepted:${SUGGESTION_ID}`,
        }),
      ]);
    });

    it("creates nothing when the claim itself cannot be written", async () => {
      const { service, create, createDraft } = makeService();
      create.mockRejectedValue(new Error("connection reset"));

      // The claim precedes creation, so a failure here must abort before any
      // domain record exists — the opposite of the old ordering, where the KPI
      // was already created by the time provenance was attempted.
      await expect(service.accept(kpiInput, ACTOR_ID)).rejects.toThrow("connection reset");
      expect(createDraft).not.toHaveBeenCalled();
    });

    it("does not fail an accept whose provenance completion fails", async () => {
      const { service, prisma } = makeService();
      prisma.$transaction.mockRejectedValue(new Error("connection reset"));

      // The KPI exists by this point. Failing the call would tell the user
      // nothing was created, which would be false.
      await expect(service.accept(kpiInput, ACTOR_ID)).resolves.toMatchObject({
        subjectId: CREATED_KPI_ID,
      });
    });

    it("releases the claim when creation fails, so the reviewer can retry", async () => {
      const { service, createDraft, store } = makeService();
      createDraft.mockRejectedValueOnce(
        new RegistryOperationError("An open draft already exists"),
      );

      await expect(service.accept(kpiInput, ACTOR_ID)).rejects.toBeInstanceOf(
        RegistryOperationError,
      );
      expect(store.rows.has(SUGGESTION_ID)).toBe(false);

      // A retry now succeeds rather than being permanently blocked by a claim
      // that produced nothing.
      createDraft.mockResolvedValue({
        definition: { id: CREATED_KPI_ID },
        version: { id: "v", version: 1 },
      });
      await expect(service.accept(kpiInput, ACTOR_ID)).resolves.toMatchObject({
        subjectId: CREATED_KPI_ID,
        alreadyAccepted: false,
      });
    });

    it("keeps the claim when the KPI exists but its alignment fails", async () => {
      const { service, setAlignments, store } = makeService();
      setAlignments.mockRejectedValue(new RegistryOperationError("KPI was not found"));

      await expect(service.accept(kpiInput, ACTOR_ID)).rejects.toBeInstanceOf(
        RegistryOperationError,
      );

      // Releasing here would let a retry create a second KPI, so the claim is
      // settled against the record that does exist.
      expect(store.rows.get(SUGGESTION_ID)?.subjectId).toBe(CREATED_KPI_ID);
    });
  });

  describe("idempotency", () => {
    it("re-accepting the same suggestion creates nothing a second time", async () => {
      const { service, findUnique, createDraft } = makeService();
      findUnique.mockResolvedValue({
        subjectType: "KPI_DEFINITION",
        subjectId: CREATED_KPI_ID,
        edited: false,
      });

      const result = await service.accept(kpiInput, ACTOR_ID);

      expect(createDraft).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        subjectId: CREATED_KPI_ID,
        alreadyAccepted: true,
      });
    });

    it("resolves an already-accepted OKR back to the OKR it became", async () => {
      const { service, findUnique, createOkr } = makeService();
      findUnique.mockResolvedValue({
        subjectType: "OKR",
        subjectId: CREATED_OKR_ID,
        edited: true,
      });

      const result = await service.accept(okrInput, ACTOR_ID);

      expect(createOkr).not.toHaveBeenCalled();
      expect(result).toEqual({
        suggestionId: SUGGESTION_ID,
        subjectType: "okr",
        subjectId: CREATED_OKR_ID,
        alreadyAccepted: true,
        edited: true,
      });
    });
  });

  describe("concurrency", () => {
    /**
     * The race the claim protocol exists to close.
     *
     * Both callers observe "no provenance yet" — the fast-path read is
     * genuinely racy and always will be. What makes the outcome safe is that
     * the claim insert happens before any domain write, so only one caller ever
     * reaches `createDraft`.
     */
    it("two concurrent accepts of one suggestion create exactly one KPI", async () => {
      const { service, createDraft, store } = makeService();

      // Hold both callers at the creation step until they have both started,
      // so the interleaving is deterministic rather than incidental.
      let releaseCreation: () => void = () => {};
      const creationGate = new Promise<void>((resolve) => {
        releaseCreation = resolve;
      });
      createDraft.mockImplementation(async () => {
        await creationGate;
        return { definition: { id: CREATED_KPI_ID }, version: { id: "v", version: 1 } };
      });

      const first = service.accept(kpiInput, ACTOR_ID);
      const second = service.accept(kpiInput, ACTOR_ID);

      releaseCreation();
      const [a, b] = await Promise.all([first, second]);

      // The invariant: one domain record, one provenance row, and both callers
      // pointing at the same subject.
      expect(createDraft).toHaveBeenCalledTimes(1);
      expect(store.rows.size).toBe(1);
      expect(a.subjectId).toBe(CREATED_KPI_ID);
      expect(b.subjectId).toBe(CREATED_KPI_ID);
      expect(a.subjectId).toBe(b.subjectId);

      // Exactly one of them created it; the other resolved to that result.
      expect([a.alreadyAccepted, b.alreadyAccepted].sort()).toEqual([false, true]);
    });

    it("two concurrent accepts of one OKR create exactly one OKR", async () => {
      const { service, createOkr, store } = makeService();

      let releaseCreation: () => void = () => {};
      const creationGate = new Promise<void>((resolve) => {
        releaseCreation = resolve;
      });
      createOkr.mockImplementation(async () => {
        await creationGate;
        return { id: CREATED_OKR_ID, keyResults: [] };
      });

      const both = Promise.all([
        service.accept(okrInput, ACTOR_ID),
        service.accept(okrInput, ACTOR_ID),
      ]);
      releaseCreation();
      const [a, b] = await both;

      expect(createOkr).toHaveBeenCalledTimes(1);
      expect(store.rows.size).toBe(1);
      expect(a.subjectId).toBe(CREATED_OKR_ID);
      expect(b.subjectId).toBe(CREATED_OKR_ID);
    });

    it("serialises on the unique constraint, not on the pre-read", async () => {
      const { service, create, store, createDraft } = makeService();

      await Promise.all([
        service.accept(kpiInput, ACTOR_ID),
        service.accept(kpiInput, ACTOR_ID),
      ]);

      // Both callers attempted to claim — proving neither was filtered out by
      // the racy fast-path read — and the database rejected the second one.
      // That rejection is what stops the loser before it can create anything.
      expect(create).toHaveBeenCalledTimes(2);
      expect(store.rows.size).toBe(1);
      expect(createDraft).toHaveBeenCalledTimes(1);
    });

    it("ten concurrent accepts still create exactly one record", async () => {
      const { service, createDraft, store } = makeService();

      const results = await Promise.all(
        Array.from({ length: 10 }, () => service.accept(kpiInput, ACTOR_ID)),
      );

      expect(createDraft).toHaveBeenCalledTimes(1);
      expect(store.rows.size).toBe(1);
      expect(new Set(results.map((result) => result.subjectId)).size).toBe(1);
      expect(results.filter((result) => !result.alreadyAccepted)).toHaveLength(1);
    });

    it("a loser whose winner never settles reports progress rather than duplicating", async () => {
      const { service, createDraft, store } = makeService();

      // Simulate a winner that claimed and then died: the claim exists with no
      // subject id, and nothing will ever fill it in.
      store.rows.set(SUGGESTION_ID, {
        subjectType: "KPI_DEFINITION",
        subjectId: null,
        edited: false,
      });

      await expect(service.accept(kpiInput, ACTOR_ID)).rejects.toBeInstanceOf(
        AiAcceptInProgressError,
      );

      // Refusing is the safe outcome. Creating a second KPI would not be.
      expect(createDraft).not.toHaveBeenCalled();
    }, 15_000);

    it("reports an in-flight accept as its own outcome in a batch", async () => {
      const { service, store } = makeService();
      store.rows.set(SUGGESTION_ID, {
        subjectType: "KPI_DEFINITION",
        subjectId: null,
        edited: false,
      });

      const result = await service.acceptMany([kpiInput], ACTOR_ID);

      expect(result.accepted).toEqual([]);
      expect(result.failed[0]).toMatchObject({
        suggestionId: SUGGESTION_ID,
        reason: "in_progress",
      });
    }, 15_000);
  });

  describe("accept all", () => {
    const second: AcceptSuggestionInput = {
      ...kpiInput,
      suggestionId: "99999999-9999-4999-8999-999999999999",
      titleEn: "Expansion ARR",
    };

    it("creates every valid item in the batch", async () => {
      const { service, createDraft } = makeService();

      const result = await service.acceptMany([kpiInput, second], ACTOR_ID);

      expect(createDraft).toHaveBeenCalledTimes(2);
      expect(result.accepted).toHaveLength(2);
      expect(result.failed).toEqual([]);
    });

    it("keeps the valid items when one is refused as a duplicate", async () => {
      const { service, findSimilar, createDraft } = makeService();
      findSimilar.mockImplementation(({ text }: { text: string }) =>
        Promise.resolve(
          text === "Expansion ARR"
            ? [
                {
                  kpiDefinitionId: "existing",
                  kpiVersionId: "v",
                  version: 1,
                  status: "active",
                  nameEn: "Expansion ARR",
                  nameAr: "توسع",
                  similarity: 0.99,
                  rank: 1,
                  matchingFields: [],
                },
              ]
            : [],
        ),
      );

      const result = await service.acceptMany([kpiInput, second], ACTOR_ID);

      expect(createDraft).toHaveBeenCalledTimes(1);
      expect(result.accepted).toHaveLength(1);
      expect(result.failed).toEqual([
        expect.objectContaining({
          suggestionId: second.suggestionId,
          reason: "duplicate",
        }),
      ]);
    });

    it("reports a creation failure per item without discarding the rest", async () => {
      const { service, createDraft } = makeService();
      createDraft
        .mockRejectedValueOnce(new RegistryOperationError("An open draft already exists"))
        .mockResolvedValueOnce({
          definition: { id: CREATED_KPI_ID },
          version: { id: "v", version: 1 },
        });

      const result = await service.acceptMany([kpiInput, second], ACTOR_ID);

      expect(result.accepted).toHaveLength(1);
      expect(result.failed[0]).toMatchObject({
        suggestionId: SUGGESTION_ID,
        reason: "creation_failed",
      });
    });

    it("retrying the whole batch does not duplicate what already landed", async () => {
      const { service, findUnique, createDraft } = makeService();
      const alreadyAccepted = new Map([
        [SUGGESTION_ID, { subjectType: "KPI_DEFINITION", subjectId: CREATED_KPI_ID, edited: false }],
      ]);
      findUnique.mockImplementation(({ where }: { where: { suggestionId: string } }) =>
        Promise.resolve(alreadyAccepted.get(where.suggestionId) ?? null),
      );

      const result = await service.acceptMany([kpiInput, second], ACTOR_ID);

      // Only the item without existing provenance is created.
      expect(createDraft).toHaveBeenCalledTimes(1);
      expect(result.accepted.filter((item) => item.alreadyAccepted)).toHaveLength(1);
      expect(result.accepted).toHaveLength(2);
    });

    it("builds the theme context once for a whole batch", async () => {
      const { service, build } = makeService();

      await service.acceptMany([kpiInput, second], ACTOR_ID);

      expect(build).toHaveBeenCalledTimes(1);
    });
  });

  describe("rejecting", () => {
    it("is purely a client-side decision — the service is never told about it", () => {
      const { service, createDraft, createOkr, create } = makeService();

      // There is no reject operation to call, by design: an unaccepted
      // proposal was never persisted, so there is nothing to undo and nothing
      // to record. Rejection can therefore not create or modify anything.
      expect("reject" in service).toBe(false);
      expect(createDraft).not.toHaveBeenCalled();
      expect(createOkr).not.toHaveBeenCalled();
      expect(create).not.toHaveBeenCalled();
    });
  });
});
