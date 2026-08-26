import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { seedCanonicalStrategy } from "./seed-canonical-strategy";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the canonical strategy");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

seedCanonicalStrategy(prisma)
  .then(() => {
    console.log("Canonical strategy demo seed completed successfully");
  })
  .catch((error: unknown) => {
    console.error("Canonical strategy demo seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
