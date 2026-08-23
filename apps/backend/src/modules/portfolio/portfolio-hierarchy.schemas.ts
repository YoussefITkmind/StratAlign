import { z } from "zod";
import { hierarchyImportPayloadSchema } from "../strategy/strategy-hierarchy-import.schema";

const name = z.string().trim().min(1).max(300);
const uuid = z.string().uuid();

export const normalizedHierarchySchema = z.object({
  portfolios: z.array(z.object({
    nameEn: name,
    nameAr: name,
    areasOfFocus: z.array(z.object({
      nameEn: name,
      nameAr: name,
      plays: z.array(z.object({
        id: uuid.optional(),
        name: name.optional(),
      }).strict().refine((play) => play.id !== undefined || play.name !== undefined, {
        message: "A play reference requires id or name",
      })).max(10_000).default([]),
    }).strict()).min(1).max(2_000),
  }).strict()).min(1).max(500),
}).strict().superRefine((hierarchy, context) => {
  const areas = hierarchy.portfolios.reduce((count, portfolio) => count + portfolio.areasOfFocus.length, 0);
  const mappings = hierarchy.portfolios.reduce((count, portfolio) => count + portfolio.areasOfFocus.reduce((areaCount, area) => areaCount + area.plays.length, 0), 0);
  if (areas > 2_000) context.addIssue({ code: "too_big", origin: "array", maximum: 2_000, inclusive: true, path: ["portfolios"], message: "Hierarchy may contain at most 2,000 Areas of Focus" });
  if (mappings > 10_000) context.addIssue({ code: "too_big", origin: "array", maximum: 10_000, inclusive: true, path: ["portfolios"], message: "Hierarchy may contain at most 10,000 play mappings" });
});

export type NormalizedHierarchy = z.infer<typeof normalizedHierarchySchema>;

export const hierarchyDiffSchema = z.object({
  nodes: hierarchyImportPayloadSchema.shape.nodes,
  edges: hierarchyImportPayloadSchema.shape.edges,
  mappings: z.array(z.object({
    mappingId: uuid,
    edgeId: uuid,
    areaOfFocusId: uuid,
    suppliedPlayId: uuid.optional(),
    suppliedPlayName: name.optional(),
    resolution: z.enum(["exact_id", "exact_name", "fuzzy", "unresolved"]),
    resolvedPlayId: uuid.optional(),
    candidates: z.array(z.object({ id: uuid, nameEn: name, nameAr: name, similarity: z.number().min(0).max(1) }).strict()).max(10),
    conflict: z.string().max(1_000).optional(),
  }).strict()).max(10_000),
  conflicts: z.array(z.string().max(1_000)).max(10_000),
}).strict();

export type HierarchyDiff = z.infer<typeof hierarchyDiffSchema>;
