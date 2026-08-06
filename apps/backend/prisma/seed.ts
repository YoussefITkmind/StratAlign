import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  NotificationChannel,
  PeriodType,
} from "../src/generated/prisma/enums";

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

  await seedPeriodCalendars();
  await seedNotificationTemplates();

  console.log("Database seed completed successfully");
}

/**
 * Calendars are generic time structures, not business configuration, so a
 * default monthly and quarterly calendar are safe to ship. Fiscal variants
 * belong to whoever owns the fiscal calendar, not to this seed.
 */
async function seedPeriodCalendars(): Promise<void> {
  const calendars = [
    {
      key: "calendar.monthly.utc",
      name: "Monthly (UTC)",
      description: "Calendar months, aligned to the Gregorian year.",
      periodType: PeriodType.MONTH,
      fiscalYearStartMonth: 1,
    },
    {
      key: "calendar.quarterly.utc",
      name: "Quarterly (UTC)",
      description: "Calendar quarters, aligned to the Gregorian year.",
      periodType: PeriodType.QUARTER,
      fiscalYearStartMonth: 1,
    },
  ];

  for (const calendar of calendars) {
    await prisma.periodCalendar.upsert({
      where: { key: calendar.key },
      update: {
        name: calendar.name,
        description: calendar.description,
        periodType: calendar.periodType,
        fiscalYearStartMonth: calendar.fiscalYearStartMonth,
      },
      create: { ...calendar, timezone: "UTC" },
    });
  }
}

/**
 * English and Arabic templates for every schedule milestone, matching the
 * locales the frontend already ships. Placeholders are resolved against the
 * payload the schedule notification subscriber builds.
 */
async function seedNotificationTemplates(): Promise<void> {
  const milestones = [
    {
      suffix: "window-opened",
      en: {
        subject: "Submission window open — {{periodKey}}",
        body: [
          "The submission window for {{subjectType}} {{subjectId}} is now open.",
          "",
          "Period: {{periodKey}}",
          "Closes: {{windowClosesAt}} ({{timezone}})",
        ].join("\n"),
      },
      ar: {
        subject: "فتح باب التقديم — {{periodKey}}",
        body: [
          "تم فتح نافذة التقديم لـ {{subjectType}} {{subjectId}}.",
          "",
          "الفترة: {{periodKey}}",
          "تغلق في: {{windowClosesAt}} ({{timezone}})",
        ].join("\n"),
      },
    },
    {
      suffix: "window-closing",
      en: {
        subject: "Submission window closing soon — {{periodKey}}",
        body: [
          "The submission window for {{subjectType}} {{subjectId}} closes shortly.",
          "",
          "Period: {{periodKey}}",
          "Closes: {{windowClosesAt}} ({{timezone}})",
        ].join("\n"),
      },
      ar: {
        subject: "اقتراب إغلاق باب التقديم — {{periodKey}}",
        body: [
          "ستغلق نافذة التقديم لـ {{subjectType}} {{subjectId}} قريبًا.",
          "",
          "الفترة: {{periodKey}}",
          "تغلق في: {{windowClosesAt}} ({{timezone}})",
        ].join("\n"),
      },
    },
    {
      suffix: "window-closed",
      en: {
        subject: "Submission window closed — {{periodKey}}",
        body: [
          "The submission window for {{subjectType}} {{subjectId}} has closed.",
          "",
          "Period: {{periodKey}}",
          "Review is due: {{reviewDueAt}} ({{timezone}})",
        ].join("\n"),
      },
      ar: {
        subject: "إغلاق باب التقديم — {{periodKey}}",
        body: [
          "تم إغلاق نافذة التقديم لـ {{subjectType}} {{subjectId}}.",
          "",
          "الفترة: {{periodKey}}",
          "موعد المراجعة: {{reviewDueAt}} ({{timezone}})",
        ].join("\n"),
      },
    },
    {
      suffix: "review-due",
      en: {
        subject: "Review due — {{periodKey}}",
        body: [
          "A review is due for {{subjectType}} {{subjectId}}.",
          "",
          "Period: {{periodKey}}",
          "Due: {{reviewDueAt}} ({{timezone}})",
        ].join("\n"),
      },
      ar: {
        subject: "المراجعة مستحقة — {{periodKey}}",
        body: [
          "توجد مراجعة مستحقة لـ {{subjectType}} {{subjectId}}.",
          "",
          "الفترة: {{periodKey}}",
          "الاستحقاق: {{reviewDueAt}} ({{timezone}})",
        ].join("\n"),
      },
    },
  ];

  const channels = [
    NotificationChannel.EMAIL,
    NotificationChannel.TEAMS,
    NotificationChannel.IN_APP,
  ];

  for (const milestone of milestones) {
    for (const channel of channels) {
      await upsertTemplate(
        `schedule.${milestone.suffix}`,
        "en",
        channel,
        milestone.en.subject,
        milestone.en.body,
      );

      await upsertTemplate(
        `schedule.${milestone.suffix}`,
        "ar",
        channel,
        milestone.ar.subject,
        milestone.ar.body,
      );
    }
  }

  // The digest summary is required for digest delivery to work at all, so it
  // ships alongside the milestone templates rather than as optional content.
  for (const channel of channels) {
    await upsertTemplate(
      "notification.digest.summary",
      "en",
      channel,
      "You have {{count}} pending notifications",
      ["You have {{count}} notifications from the last period:", "", "{{items}}"].join(
        "\n",
      ),
    );

    await upsertTemplate(
      "notification.digest.summary",
      "ar",
      channel,
      "لديك {{count}} إشعارات معلقة",
      ["لديك {{count}} إشعارات من الفترة الماضية:", "", "{{items}}"].join("\n"),
    );
  }
}

async function upsertTemplate(
  key: string,
  locale: string,
  channel: NotificationChannel,
  subjectTemplate: string,
  bodyTemplate: string,
): Promise<void> {
  await prisma.notificationTemplate.upsert({
    where: {
      key_locale_channel: { key, locale, channel },
    },
    update: { subjectTemplate, bodyTemplate, isActive: true },
    create: { key, locale, channel, subjectTemplate, bodyTemplate },
  });
}

main()
  .catch((error: unknown) => {
    console.error("Database seed failed", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });