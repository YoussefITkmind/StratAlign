import { z } from "zod";

const name = z.string().trim().min(1).max(300);
const uuid = z.string().uuid();

export const hierarchyImportPayloadSchema = z.object({
  diffId: uuid,
  nodes: z.array(z.object({
    id: uuid,
    type: z.enum(["portfolio", "area_of_focus"]),
    nameEn: name,
    nameAr: name,
  }).strict()).max(2_000),
  edges: z.array(z.object({
    id: uuid,
    fromNodeId: uuid,
    toNodeId: uuid,
    edgeType: z.enum(["contains", "belongs_to_portfolio"]),
  }).strict()).max(10_000),
}).strict();

export type HierarchyImportPayload = z.infer<typeof hierarchyImportPayloadSchema>;
