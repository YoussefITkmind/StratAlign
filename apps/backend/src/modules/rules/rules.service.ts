import {
  evaluateRule,
  parseRuleInput,
  ruleDocumentSchema,
  type RuleDocument,
  type RuleInput,
  type RuleResult,
  type RuleType,
} from "@spm/rules";

import type { PrismaService } from "../../database/prisma.service";

type PrismaRuleType =
  | "THRESHOLD_STATUS"
  | "ROLLUP"
  | "VARIANCE_ALERT"
  | "RAG_AGGREGATION"
  | "GATE_CRITERIA";

export interface CreateRuleDraftInput {
  ruleKey: string;
  name: string;
  document: RuleDocument;
  createdBy: string;
}

export interface RuleDefinitionView {
  id: string;
  ruleKey: string;
  ruleType: RuleType;
  name: string;
  document: RuleDocument;
  version: number;
  status: "draft" | "published" | "superseded";
  isCurrent: boolean;
  publishedAt: Date | null;
  supersedesId: string | null;
  createdAt: Date;
  createdBy: string;
}

export class RulesOperationError extends Error {
  readonly code = "RULES_OPERATION_FAILED";

  constructor(message = "Unable to complete rules operation") {
    super(message);
    this.name = "RulesOperationError";
  }
}

function toPrismaRuleType(ruleType: RuleType): PrismaRuleType {
  switch (ruleType) {
    case "threshold_status":
      return "THRESHOLD_STATUS";
    case "rollup":
      return "ROLLUP";
    case "variance_alert":
      return "VARIANCE_ALERT";
    case "rag_aggregation":
      return "RAG_AGGREGATION";
    case "gate_criteria":
      return "GATE_CRITERIA";
  }
}

function fromPrismaRuleType(ruleType: PrismaRuleType): RuleType {
  switch (ruleType) {
    case "THRESHOLD_STATUS":
      return "threshold_status";
    case "ROLLUP":
      return "rollup";
    case "VARIANCE_ALERT":
      return "variance_alert";
    case "RAG_AGGREGATION":
      return "rag_aggregation";
    case "GATE_CRITERIA":
      return "gate_criteria";
  }
}

function fromPrismaStatus(
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED",
): RuleDefinitionView["status"] {
  switch (status) {
    case "DRAFT":
      return "draft";
    case "PUBLISHED":
      return "published";
    case "SUPERSEDED":
      return "superseded";
  }
}

export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  async createDraft(
    input: CreateRuleDraftInput,
  ): Promise<RuleDefinitionView> {
    const document = ruleDocumentSchema.parse(input.document);
    const ruleKey = input.ruleKey.trim();
    const name = input.name.trim();

    if (!ruleKey || !name) {
      throw new RulesOperationError(
        "Rule key and name are required",
      );
    }

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.ruleDefinition.findFirst({
          where: {
            ruleKey,
            isCurrent: true,
          },
        });

        const latest = current ??
          await transaction.ruleDefinition.findFirst({
            where: {
              ruleKey,
            },
            orderBy: {
              version: "desc",
            },
          });

        if (current?.status === "DRAFT") {
          throw new RulesOperationError(
            "A current draft already exists for this rule",
          );
        }

        if (current) {
          await transaction.ruleDefinition.update({
            where: {
              id: current.id,
            },
            data: {
              isCurrent: false,
            },
          });
        }

        const created = await transaction.ruleDefinition.create({
          data: {
            ruleKey,
            name,
            ruleType: toPrismaRuleType(document.ruleType),
            documentJson: document,
            version: (latest?.version ?? 0) + 1,
            status: "DRAFT",
            isCurrent: true,
            supersedesId: latest?.id,
            createdById: input.createdBy,
          },
        });

        return this.toView(created);
      });
    } catch (error) {
      if (error instanceof RulesOperationError) {
        throw error;
      }

      throw new RulesOperationError();
    }
  }

  async publish(
    ruleId: string,
  ): Promise<RuleDefinitionView> {
    try {
      const published = await this.prisma.$transaction(
        async (transaction) => {
          const draft =
            await transaction.ruleDefinition.findUnique({
              where: {
                id: ruleId,
              },
            });

          if (
            !draft ||
            draft.status !== "DRAFT" ||
            !draft.isCurrent
          ) {
            throw new RulesOperationError(
              "Only the current draft can be published",
            );
          }

          if (draft.supersedesId) {
            await transaction.ruleDefinition.update({
              where: {
                id: draft.supersedesId,
              },
              data: {
                status: "SUPERSEDED",
                isCurrent: false,
              },
            });
          }

          return transaction.ruleDefinition.update({
            where: {
              id: draft.id,
            },
            data: {
              status: "PUBLISHED",
              publishedAt: new Date(),
              isCurrent: true,
            },
          });
        },
      );

      return this.toView(published);
    } catch (error) {
      if (error instanceof RulesOperationError) {
        throw error;
      }

      throw new RulesOperationError();
    }
  }

  async list(): Promise<RuleDefinitionView[]> {
    const rules = await this.prisma.ruleDefinition.findMany({
      where: {
        isCurrent: true,
      },
      orderBy: [
        {
          name: "asc",
        },
        {
          version: "desc",
        },
      ],
    });

    return rules.map((rule) => this.toView(rule));
  }

  async getVersion(
    ruleKey: string,
    version: number,
  ): Promise<RuleDefinitionView | null> {
    const rule = await this.prisma.ruleDefinition.findUnique({
      where: {
        ruleKey_version: {
          ruleKey,
          version,
        },
      },
    });

    return rule ? this.toView(rule) : null;
  }

  async getPublished(
    ruleKey: string,
  ): Promise<RuleDefinitionView | null> {
    const rule = await this.prisma.ruleDefinition.findFirst({
      where: {
        ruleKey,
        status: "PUBLISHED",
      },
      orderBy: {
        version: "desc",
      },
    });

    return rule ? this.toView(rule) : null;
  }

  async evaluate(
    ruleKey: string,
    input: RuleInput,
  ): Promise<RuleResult> {
    const rule = await this.getPublished(ruleKey);

    if (!rule) {
      throw new RulesOperationError(
        "Published rule was not found",
      );
    }

    const validatedInput = parseRuleInput(
      rule.document,
      input,
    );

    return evaluateRule(
      rule.document,
      validatedInput,
    );
  }

  private toView(rule: {
    id: string;
    ruleKey: string;
    ruleType: PrismaRuleType;
    name: string;
    documentJson: unknown;
    version: number;
    status: "DRAFT" | "PUBLISHED" | "SUPERSEDED";
    isCurrent: boolean;
    publishedAt: Date | null;
    supersedesId: string | null;
    createdAt: Date;
    createdById: string;
  }): RuleDefinitionView {
    const document = ruleDocumentSchema.parse(
      rule.documentJson,
    );

    if (
      document.ruleType !== fromPrismaRuleType(rule.ruleType)
    ) {
      throw new RulesOperationError(
        "Stored rule type does not match its document",
      );
    }

    return {
      id: rule.id,
      ruleKey: rule.ruleKey,
      ruleType: document.ruleType,
      name: rule.name,
      document,
      version: rule.version,
      status: fromPrismaStatus(rule.status),
      isCurrent: rule.isCurrent,
      publishedAt: rule.publishedAt,
      supersedesId: rule.supersedesId,
      createdAt: rule.createdAt,
      createdBy: rule.createdById,
    };
  }
}
