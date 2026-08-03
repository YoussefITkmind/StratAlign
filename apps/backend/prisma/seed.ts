import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const adapter = new PrismaPg({
  connectionString,
});

const prisma = new PrismaClient({
  adapter,
});

async function main(): Promise<void> {
  await prisma.systemSetting.upsert({
    where: {
      key: "platform.initialized",
    },
    update: {
      value: {
        initialized: true,
      },
    },
    create: {
      key: "platform.initialized",
      value: {
        initialized: true,
      },
    },
  });

  console.log("Database seed completed successfully");
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });