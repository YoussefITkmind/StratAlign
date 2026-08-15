import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const alice = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.E2E_MEMBER_EMAIL ?? "alice@example.test" },
    select: { id: true },
  });
  const bob = await prisma.user.findUniqueOrThrow({
    where: { email: process.env.E2E_ADMIN_EMAIL ?? "bob@example.test" },
    select: { id: true },
  });

  console.log(JSON.stringify({ aliceId: alice.id, bobId: bob.id }));
}

main()
  .catch((error: unknown) => {
    console.error("Governance E2E user resolution failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
