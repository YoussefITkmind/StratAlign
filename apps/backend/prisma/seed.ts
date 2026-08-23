import "dotenv/config";
import { createHash } from "node:crypto";
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
  {
    email: "dana@example.test",
    displayName: "Dana Test User",
  },
  {
    email: "erin@example.test",
    displayName: "Erin Test User",
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
  const executiveViewerId = users.get("dana@example.test")!;
  const kpiOwnerId = users.get("erin@example.test")!;
  const analystRole = await prisma.role.findUniqueOrThrow({
    where: { name: "strategy_analyst" },
  });
  const administratorRole = await prisma.role.findUniqueOrThrow({
    where: { name: "platform_administrator" },
  });
  const executiveViewerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "executive_viewer" },
  });
  const kpiOwnerRole = await prisma.role.findUniqueOrThrow({
    where: { name: "kpi_owner" },
  });
  const seoAdministratorRole = await prisma.role.findUniqueOrThrow({
    where: { name: "seo_administrator" },
  });

  for (const grant of [
    { userId: administratorId, roleId: administratorRole.id },
    // `platform_administrator` covers IAM/config; strategy content actions
    // (theme/node creation, AI-suggestion authoring) are gated on
    // `seo_administrator` instead, so the demo admin needs both to exercise
    // the full app.
    { userId: administratorId, roleId: seoAdministratorRole.id },
    { userId: ordinaryUserId, roleId: analystRole.id },
    { userId: teamUserId, roleId: administratorRole.id },
    { userId: teamUserId, roleId: seoAdministratorRole.id },
    { userId: executiveViewerId, roleId: executiveViewerRole.id },
    { userId: kpiOwnerId, roleId: kpiOwnerRole.id },
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
  // `GroupRoleMapping` is a single versioned pointer per `groupClaim` (see the
  // `[groupClaim, version]` unique constraint) — it maps an OIDC group to one
  // current role, not a set. `seo_administrator` is granted directly via
  // `ScopeGrant` above instead, which is what local-credential test users
  // (bob@example.test, team@test.com) actually resolve roles from.
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

async function seedStrategyHierarchy(): Promise<void> {
  const existingRoot = await prisma.strategyHierarchyNode.findFirst({ where: { parentId: null } });
  if (existingRoot) {
    console.log("Strategy hierarchy already seeded, skipping");
    return;
  }

  // "bob@example.test" only exists in non-production seeds (see seedTestUsers
  // above); in a deployed environment there is no fixed demo admin to key
  // off, so fall back to whichever real account exists.
  const administrator =
    (await prisma.user.findUnique({ where: { email: "bob@example.test" } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!administrator) {
    console.log("No users exist yet, skipping strategy hierarchy seed");
    return;
  }

  // Every existing user gets seo_administrator so the seeded demo tree is
  // immediately manageable — except the single-purpose e2e fixtures, whose
  // whole point is to hold exactly one narrow role each. Granting them
  // seo_administrator too outranks that role in the Home composition's
  // priority order and silently breaks role-based e2e assertions.
  const singlePurposeE2eEmails = ["dana@example.test", "erin@example.test", "alice@example.test"];
  const seoAdministratorRole = await prisma.role.findUnique({ where: { name: "seo_administrator" } });
  if (seoAdministratorRole) {
    const allUsers = await prisma.user.findMany({
      select: { id: true },
      where: { email: { notIn: singlePurposeE2eEmails } },
    });
    for (const user of allUsers) {
      await prisma.scopeGrant.upsert({
        where: {
          userId_roleId_orgScopeType_orgScopeId: {
            userId: user.id,
            roleId: seoAdministratorRole.id,
            orgScopeType: "FUNCTION",
            orgScopeId: "platform",
          },
        },
        update: {},
        create: {
          userId: user.id,
          roleId: seoAdministratorRole.id,
          orgScopeType: "FUNCTION",
          orgScopeId: "platform",
          grantedById: administrator.id,
        },
      });
    }
    console.log(`Granted seo_administrator to ${allUsers.length} user(s)`);
  } else {
    console.log("seo_administrator role not found, skipping role grants");
  }

  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000);

  const initials = (name: string) =>
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("");

  const OWNER_PALETTE = [
    "bg-indigo-500", "bg-blue-500", "bg-emerald-500", "bg-amber-500",
    "bg-rose-500", "bg-purple-500", "bg-cyan-600", "bg-teal-500",
  ];
  const colorFor = (seed: string) => {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
    return OWNER_PALETTE[hash % OWNER_PALETTE.length];
  };

  const owner = (name: string) => ({ ownerName: name, ownerInitials: initials(name), ownerColor: colorFor(name) });
  const createdBy = administrator.id;

  const plan = await prisma.strategyHierarchyNode.create({
    data: {
      name: "Acme Corp 2025 Strategic Plan",
      type: "PLAN",
      status: "ON_TRACK",
      progress: 74,
      ...owner("Alex Morgan"),
      budget: "$12.4M",
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-12-01"),
      description: "Our comprehensive corporate strategy to drive growth, customer excellence, and operational efficiency in 2025.",
      linkedKpis: ["Revenue Growth", "Strategy Score"],
      createdBy,
      activity: {
        create: [
          { message: "Progress updated to 74%", actorName: "Alex Morgan", createdAt: hoursAgo(1) },
          { message: "Status updated to At Risk", actorName: "Alex Morgan", createdAt: hoursAgo(2) },
        ],
      },
    },
  });

  const revenue = await prisma.strategyHierarchyNode.create({
    data: {
      parentId: plan.id, name: "Revenue & Growth", type: "PERSPECTIVE", status: "AT_RISK", progress: 58,
      ...owner("Sarah Chen"), createdBy,
    },
  });

  const driveRevenue = await prisma.strategyHierarchyNode.create({
    data: {
      parentId: revenue.id, name: "Drive Revenue Growth 40% YoY", type: "OBJECTIVE", status: "AT_RISK", progress: 67,
      ...owner("Sarah Chen"), createdBy,
    },
  });

  const enterpriseSales = await prisma.strategyHierarchyNode.create({
    data: {
      parentId: driveRevenue.id, name: "Enterprise Sales Acceleration", type: "INITIATIVE", status: "AT_RISK", progress: 63,
      ...owner("Tom Reyes"), createdBy,
    },
  });

  await prisma.strategyHierarchyNode.create({
    data: {
      parentId: enterpriseSales.id, name: "APAC Market Entry", type: "PROJECT", status: "OFF_TRACK", progress: 31,
      ...owner("Tom Reyes"), createdBy,
    },
  });

  await prisma.strategyHierarchyNode.create({
    data: {
      parentId: enterpriseSales.id, name: "Enterprise Pipeline Expansion", type: "PROJECT", status: "ON_TRACK", progress: 72,
      ...owner("Maria Wong"), createdBy,
    },
  });

  await prisma.strategyHierarchyNode.create({
    data: {
      parentId: driveRevenue.id, name: "New Product Lines", type: "INITIATIVE", status: "ON_TRACK", progress: 65,
      ...owner("Priya Nair"), createdBy,
    },
  });

  await prisma.strategyHierarchyNode.create({
    data: {
      parentId: revenue.id, name: "Expand into 3 New Geographic Markets", type: "OBJECTIVE", status: "AT_RISK", progress: 42,
      ...owner("James Park"), createdBy,
    },
  });
}

async function seedDataIntegrations(): Promise<void> {
  const existing = await prisma.connection.findFirst();
  if (existing) {
    console.log("Data & Integrations already seeded, skipping");
    return;
  }

  const administrator =
    (await prisma.user.findUnique({ where: { email: "bob@example.test" } })) ??
    (await prisma.user.findFirst({ orderBy: { createdAt: "asc" } }));

  if (!administrator) {
    console.log("No users exist yet, skipping Data & Integrations seed");
    return;
  }

  await prisma.connection.createMany({
    data: [
      {
        name: "Salesforce CRM", category: "CRM", status: "CONNECTED", direction: "Bi-directional",
        lastSyncLabel: "Last: 4 minutes ago", recordsIn: 18420, recordsOut: 6210,
        meta: "OAuth 2.0 · v58.0", color: "bg-blue-500", icon: "SF",
      },
      {
        name: "NetSuite ERP", category: "Finance", status: "ERROR", direction: "Inbound",
        lastSyncLabel: "Failed 2 hours ago", recordsIn: 9032, recordsOut: 0,
        meta: "REST · Token auth", color: "bg-orange-500", icon: "NS",
      },
      {
        name: "Snowflake ETL Service", category: "Data Warehouse", status: "ERROR", direction: "Outbound",
        lastSyncLabel: "Failed 38 minutes ago", recordsIn: 0, recordsOut: 40218,
        meta: "JDBC · Key pair auth", color: "bg-cyan-600", icon: "SN",
      },
      {
        name: "Workday HCM", category: "HR", status: "CONNECTED", direction: "Inbound",
        lastSyncLabel: "Last: 1 hour ago", recordsIn: 3204, recordsOut: 0,
        meta: "SOAP · Cert auth", color: "bg-emerald-600", icon: "WD",
      },
      {
        name: "HubSpot Marketing", category: "Marketing", status: "PENDING", direction: "Bi-directional",
        lastSyncLabel: "Awaiting authorization", recordsIn: 0, recordsOut: 0,
        meta: "OAuth 2.0 · Setup incomplete", color: "bg-fuchsia-500", icon: "HS",
      },
      {
        name: "Jira Cloud", category: "Project Management", status: "CONNECTED", direction: "Bi-directional",
        lastSyncLabel: "Last: 12 minutes ago", recordsIn: 1540, recordsOut: 890,
        meta: "REST · API token", color: "bg-indigo-600", icon: "JR",
      },
      {
        name: "Zendesk Support", category: "Support", status: "DISCONNECTED", direction: "Inbound",
        lastSyncLabel: "Disconnected 3 days ago", recordsIn: 0, recordsOut: 0,
        meta: "REST · API token", color: "bg-slate-500", icon: "ZD",
      },
    ],
  });

  await prisma.syncLog.createMany({
    data: [
      {
        integrationName: "Salesforce CRM", startedLabel: "Aug 23, 09:12", durationLabel: "48s",
        status: "SUCCESS", recordsIn: 1240, recordsOut: 320, errorCount: 0,
        message: "Sync completed without errors.", color: "bg-blue-500", icon: "SF",
      },
      {
        integrationName: "Snowflake ETL Service", startedLabel: "Aug 23, 08:44", durationLabel: "2m 10s",
        status: "FAILED", recordsIn: 0, recordsOut: 0, errorCount: 12,
        message: "Connection timed out while authenticating with key pair.", color: "bg-cyan-600", icon: "SN",
      },
      {
        integrationName: "NetSuite ERP", startedLabel: "Aug 23, 07:58", durationLabel: "1m 02s",
        status: "FAILED", recordsIn: 0, recordsOut: 0, errorCount: 4,
        message: "Stored API token expired.", color: "bg-orange-500", icon: "NS",
      },
      {
        integrationName: "Workday HCM", startedLabel: "Aug 23, 07:30", durationLabel: "3m 41s",
        status: "PARTIAL", recordsIn: 2980, recordsOut: 0, errorCount: 3,
        message: "224 records skipped due to schema mismatch.", color: "bg-emerald-600", icon: "WD",
      },
      {
        integrationName: "Jira Cloud", startedLabel: "Aug 23, 06:15", durationLabel: "22s",
        status: "SUCCESS", recordsIn: 410, recordsOut: 205, errorCount: 0,
        message: "Sync completed without errors.", color: "bg-indigo-600", icon: "JR",
      },
      {
        integrationName: "Salesforce CRM", startedLabel: "Aug 23, 05:59", durationLabel: "Running…",
        status: "RUNNING", recordsIn: null, recordsOut: null, errorCount: 0,
        message: "Sync in progress.", color: "bg-blue-500", icon: "SF",
      },
    ],
  });

  const oneYearFromNow = new Date();
  oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
  const seedKeyHash = (seed: string) => createHash("sha256").update(seed).digest("hex");

  await prisma.apiKey.createMany({
    data: [
      {
        name: "Mobile App – Production", scope: "READ", keyPrefix: "bsc_rd_sk_",
        keyHash: seedKeyHash("mobile-app-production"), ownerId: administrator.id, ownerName: "Alex Morgan",
        lastUsedLabel: "3 minutes ago", requestCount: 128430, expiresAt: oneYearFromNow,
      },
      {
        name: "Data Warehouse Sync", scope: "WRITE", keyPrefix: "bsc_wrt_sk_",
        keyHash: seedKeyHash("data-warehouse-sync"), ownerId: administrator.id, ownerName: "Priya Nair",
        lastUsedLabel: "1 hour ago", requestCount: 54210, expiresAt: oneYearFromNow,
      },
      {
        name: "Legacy Reporting Tool", scope: "ADMIN", keyPrefix: "bsc_adm_sk_",
        keyHash: seedKeyHash("legacy-reporting-tool"), ownerId: administrator.id, ownerName: "Alex Morgan",
        disabled: true, lastUsedLabel: "2 days ago", requestCount: 980, expiresAt: oneYearFromNow,
      },
    ],
  });

  await prisma.webhook.createMany({
    data: [
      {
        name: "Forecast Update → Slack", url: "https://platform.company/webhooks/forecast-slack",
        events: ["forecast.updated"], active: true, successRate: 99.6,
      },
      {
        name: "Opportunity Sync → Finance", url: "https://platform.company/webhooks/opp-finance",
        events: ["opportunity.won", "opportunity.lost"], active: true, successRate: 82.3,
      },
      {
        name: "Sync Failure Alerts", url: "https://platform.company/webhooks/sync-alerts",
        events: ["sync.failed"], active: false, successRate: 100,
      },
    ],
  });
}

async function main(): Promise<void> {
  await seedSystemSettings();
  await seedRolesAndPolicies();
  await seedTestUsers();
  await seedNotificationTemplates();
  await seedStrategyHierarchy();
  await seedDataIntegrations();

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
