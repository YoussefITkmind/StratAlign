import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { NotificationChannel } from "../src/generated/prisma/enums";
import { DIGEST_SUMMARY_TEMPLATE_KEY } from "../src/modules/notifications/digest/digest.service";
import { hashPassword } from "../src/modules/auth/password.service";
import { PLATFORM_ROLES, STEP_UP_ACTION_CLASSES } from "@spm/domain-iam";

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
  {
    email: "team@test.com",
    displayName: "Team Development User",
    password: "Team123!",
  },
];

const roleDescriptions: Record<(typeof PLATFORM_ROLES)[number], string> = {
  executive_viewer: "Read-only executive strategy visibility",
  sector_leadership: "Leadership responsibility within an organizational sector",
  objective_play_owner: "Ownership of strategic objectives and plays",
  initiative_owner: "Ownership of strategic initiatives",
  kpi_owner: "Ownership of key performance indicators",
  data_steward: "Stewardship of governed performance data",
  vmo_lead: "Value management office leadership",
  benefit_owner: "Ownership of expected and realized benefits",
  strategy_analyst: "Strategy analysis and reporting",
  governance_committee: "Governance committee participation",
  seo_administrator: "Strategy execution office administration",
  platform_administrator: "Platform IAM and configuration administration",
};

const stepUpMaxAges: Record<(typeof STEP_UP_ACTION_CLASSES)[number], number> = {
  weighting_change: 300,
  threshold_change: 300,
  rule_publication: 300,
  retirement: 300,
  role_grant: 300,
  mapping_change: 300,
  restricted_export: 600,
};

async function seedRolesAndPolicies(): Promise<void> {
  for (const name of PLATFORM_ROLES) {
    await prisma.role.upsert({
      where: { name },
      update: { description: roleDescriptions[name] },
      create: { name, description: roleDescriptions[name] },
    });
  }

  for (const actionClass of STEP_UP_ACTION_CLASSES) {
    await prisma.stepUpPolicy.upsert({
      where: { actionClass },
      update: {
        requiresStepUp: true,
        maxSessionAgeSeconds: stepUpMaxAges[actionClass],
      },
      create: {
        actionClass,
        requiresStepUp: true,
        maxSessionAgeSeconds: stepUpMaxAges[actionClass],
      },
    });
  }
}

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

  const users = new Map<string, string>();

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

    const passwordHash = await hashPassword(
      testUser.password ?? testPassword,
    );

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

    users.set(testUser.email, user.id);
  }

  const administratorId = users.get("bob@example.test")!;
  const ordinaryUserId = users.get("alice@example.test")!;
  const teamUserId = users.get("team@test.com")!;
  const analystRole = await prisma.role.findUniqueOrThrow({
    where: { name: "strategy_analyst" },
  });
  const administratorRole = await prisma.role.findUniqueOrThrow({
    where: { name: "platform_administrator" },
  });

  for (const grant of [
    { userId: administratorId, roleId: administratorRole.id },
    { userId: ordinaryUserId, roleId: analystRole.id },
    { userId: teamUserId, roleId: administratorRole.id },
  ]) {
    await prisma.scopeGrant.upsert({
      where: {
        userId_roleId_orgScopeType_orgScopeId: {
          ...grant,
          orgScopeType: "FUNCTION",
          orgScopeId: "platform",
        },
      },
      update: {},
      create: {
        ...grant,
        orgScopeType: "FUNCTION",
        orgScopeId: "platform",
        grantedById: administratorId,
      },
    });
  }

  const currentMapping = await prisma.groupRoleMapping.findFirst({
    where: { groupClaim: "stratalign-admins", isCurrent: true },
  });
  if (!currentMapping) {
    await prisma.groupRoleMapping.create({
      data: {
        groupClaim: "stratalign-admins",
        roleId: administratorRole.id,
        orgScopeType: "FUNCTION",
        orgScopeId: "platform",
        version: 1,
        createdById: administratorId,
      },
    });
  }
}

async function seedNotificationTemplates(): Promise<void> {
  const channels = [
    NotificationChannel.EMAIL,
    NotificationChannel.TEAMS,
  ];

  const scheduleKeys = [
    "schedule.window-opened",
    "schedule.window-closing",
    "schedule.window-closed",
    "schedule.review-due",
  ];

  for (const channel of channels) {
    for (const key of scheduleKeys) {
      await prisma.notificationTemplate.upsert({
        where: {
          key_locale_channel: {
            key,
            locale: "en",
            channel,
          },
        },
        update: {
          subjectTemplate: "Review due — {{periodKey}}",
          bodyTemplate: "A review is due for {{subjectType}} {{subjectId}}.",
          isActive: true,
        },
        create: {
          key,
          locale: "en",
          channel,
          subjectTemplate: "Review due — {{periodKey}}",
          bodyTemplate: "A review is due for {{subjectType}} {{subjectId}}.",
        },
      });
    }

    await prisma.notificationTemplate.upsert({
      where: {
        key_locale_channel: {
          key: DIGEST_SUMMARY_TEMPLATE_KEY,
          locale: "en",
          channel,
        },
      },
      update: {
        subjectTemplate: "You have {{count}} pending notifications",
        bodyTemplate: "{{items}}",
        isActive: true,
      },
      create: {
        key: DIGEST_SUMMARY_TEMPLATE_KEY,
        locale: "en",
        channel,
        subjectTemplate: "You have {{count}} pending notifications",
        bodyTemplate: "{{items}}",
      },
    });
  }
}

async function main(): Promise<void> {
  await seedSystemSettings();
  await seedRolesAndPolicies();
  await seedTestUsers();
  await seedNotificationTemplates();

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
