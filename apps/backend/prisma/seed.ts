import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/modules/auth/password.service";

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

const testUsers = [
  {
    email: "alice@example.test",
    displayName: "Alice Test User",
  },
  {
    email: "bob@example.test",
    displayName: "Bob Test User",
  },
  {
    email: "carol@example.test",
    displayName: "Carol Test User",
  },
];

async function seedSystemSettings(): Promise<void> {
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
}

async function seedTestUsers(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  const testPassword =
    process.env.SEED_TEST_USER_PASSWORD ??
    "LocalTestPassword123!";

  for (const testUser of testUsers) {
    const user = await prisma.user.upsert({
      where: {
        email: testUser.email,
      },
      update: {
        displayName: testUser.displayName,
      },
      create: {
        email: testUser.email,
        displayName: testUser.displayName,
      },
    });

    const passwordHash = await hashPassword(testPassword);

    await prisma.localCredential.upsert({
      where: {
        userId: user.id,
      },
      update: {
        email: testUser.email,
        passwordHash,
      },
      create: {
        userId: user.id,
        email: testUser.email,
        passwordHash,
      },
    });
  }
}

async function main(): Promise<void> {
  await seedSystemSettings();
  await seedTestUsers();

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