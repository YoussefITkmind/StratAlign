import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { StrategyNodeType, StrategyNodeState, PlanVersionStatus } from "../src/generated/prisma/enums";

/**
 * One-off helper for standing up a real "theme" strategy node so the
 * AI-Suggest modal's theme dropdown has something to select. Runs against a
 * dedicated draft plan version so it never touches the active/published plan.
 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run this script");
}

const email = process.argv[2];

if (!email) {
  console.error("Usage: npx tsx prisma/seed-ai-theme.ts <your-account-email>");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error(`No user found with email ${email}`);
  }

  let plan = await prisma.planVersion.findFirst({
    where: { status: PlanVersionStatus.DRAFT },
    orderBy: { id: "asc" },
  });

  if (!plan) {
    plan = await prisma.planVersion.create({
      data: { name: "AI Suggestions Sandbox", status: PlanVersionStatus.DRAFT },
    });
    console.log(`Created draft plan version ${plan.id}`);
  }

  const existing = await prisma.strategyNode.findFirst({
    where: {
      planVersionId: plan.id,
      type: StrategyNodeType.THEME,
      state: { not: StrategyNodeState.RETIRED },
    },
  });

  if (existing) {
    console.log(`A theme already exists: "${existing.nameEn}" (${existing.id}) — nothing to do.`);
    return;
  }

  const node = await prisma.strategyNode.create({
    data: {
      type: StrategyNodeType.THEME,
      nameEn: "Customer Experience",
      nameAr: "تجربة العميل",
      planVersionId: plan.id,
      state: StrategyNodeState.DRAFT,
      createdBy: user.id,
    },
  });

  console.log(`Created theme "${node.nameEn}" (${node.id}) in plan version ${plan.id}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
