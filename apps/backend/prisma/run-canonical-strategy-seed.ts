import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedCanonicalStrategy } from "./seed-canonical-strategy";

const connectionString = process.env.DATABASE_URL;
const DEMO_PLAN_NAME = "Apex Holdings · FY2026 Enterprise Strategy";

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the canonical strategy");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function run(): Promise<void> {
  await seedCanonicalStrategy(prisma);

  // Local/E2E databases often already contain the single ACTIVE strategy plan.
  // Keep genuine business names intact, but replace clearly test-oriented plan
  // names so the seeded demo looks like a professional product environment.
  const activePlan = await prisma.planVersion.findFirst({
    where: { status: "ACTIVE" },
  });
  if (activePlan && /(?:\be2e\b|\btest\b|^phase\s+\d)/i.test(activePlan.name)) {
    await prisma.planVersion.update({
      where: { id: activePlan.id },
      data: { name: DEMO_PLAN_NAME },
    });
    console.log(`Renamed demo active strategy plan to “${DEMO_PLAN_NAME}”`);
  }

  console.log("Canonical strategy demo seed completed successfully");
}

run()
  .catch((error: unknown) => {
    console.error("Canonical strategy demo seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
