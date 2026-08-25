import "dotenv/config";

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const SCORECARD_ID = "84000000-0000-4000-8000-000000000010";
const REVENUE_OBJECTIVE_ID = "84000000-0000-4000-8000-000000000002";
const CSAT_OBJECTIVE_ID = "84000000-0000-4000-8000-000000000003";

async function hierarchyPerspectiveId(creatorId: string): Promise<string> {
  const existing = await prisma.strategyHierarchyNode.findFirst({
    where: { type: "PERSPECTIVE" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (existing) return existing.id;

  let root = await prisma.strategyHierarchyNode.findFirst({
    where: { parentId: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!root) {
    root = await prisma.strategyHierarchyNode.create({
      data: {
        id: randomUUID(),
        name: "E2E Strategy Plan",
        type: "PLAN",
        status: "ON_TRACK",
        progress: 50,
        ownerName: "E2E Admin",
        ownerInitials: "EA",
        ownerColor: "bg-indigo-500",
        createdBy: creatorId,
      },
      select: { id: true },
    });
  }

  const created = await prisma.strategyHierarchyNode.create({
    data: {
      id: randomUUID(),
      parentId: root.id,
      name: "E2E Financial",
      type: "PERSPECTIVE",
      status: "ON_TRACK",
      progress: 50,
      ownerName: "E2E Admin",
      ownerInitials: "EA",
      ownerColor: "bg-indigo-500",
      createdBy: creatorId,
    },
    select: { id: true },
  });
  return created.id;
}

async function main() {
  const scorecard = await prisma.scorecard.findUniqueOrThrow({ where: { id: SCORECARD_ID } });
  const creator = await prisma.user.findUniqueOrThrow({ where: { email: "bob@example.test" } });
  const perspective = await prisma.perspective.findFirstOrThrow({ where: { scorecardId: SCORECARD_ID }, orderBy: { order: "asc" } });
  const objectiveId = randomUUID();

  await prisma.strategyNode.create({
    data: {
      id: objectiveId,
      type: "OBJECTIVE",
      nameEn: "Improve Pricing Strategy",
      nameAr: "تحسين استراتيجية التسعير",
      planVersionId: scorecard.planVersionId,
      state: "ACTIVE",
      createdBy: creator.id,
    },
  });

  await prisma.strategyHierarchyNode.create({
    data: {
      id: objectiveId,
      parentId: await hierarchyPerspectiveId(creator.id),
      name: "Improve Pricing Strategy",
      type: "OBJECTIVE",
      status: "AT_RISK",
      progress: 61,
      ownerName: "Sarah Chen",
      ownerInitials: "SC",
      ownerColor: "bg-sky-600",
      description: "Improve pricing discipline and enterprise deal quality.",
      linkedKpis: ["Gross Margin", "Win Rate"],
      createdBy: creator.id,
    },
  });

  console.log(JSON.stringify({
    objectiveId,
    perspectiveId: perspective.id,
    revenueObjectiveId: REVENUE_OBJECTIVE_ID,
    csatObjectiveId: CSAT_OBJECTIVE_ID,
    approverUserId: creator.id,
  }));
}

main().finally(async () => prisma.$disconnect());
