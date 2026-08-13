import "dotenv/config";

import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const SCORECARD_ID = "84000000-0000-4000-8000-000000000010";

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

  console.log(JSON.stringify({ objectiveId, perspectiveId: perspective.id }));
}

main().finally(async () => prisma.$disconnect());
