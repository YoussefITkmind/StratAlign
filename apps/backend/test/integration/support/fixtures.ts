import type { PrismaService } from "../../../src/database/prisma.service";
import { NotificationChannel } from "../../../src/generated/prisma/enums";
import { DIGEST_SUMMARY_TEMPLATE_KEY } from "../../../src/modules/notifications/digest/digest.service";

export interface SeedTemplateOptions {
  key: string;
  channel?: NotificationChannel;
  locales?: readonly string[];
}

/**
 * Seeds a template in the locales a test needs. Kept explicit rather than
 * reusing `prisma/seed.ts`, so a spec's expectations do not silently change
 * when production seed content is edited.
 */
export async function seedTemplate(
  prisma: PrismaService,
  options: SeedTemplateOptions,
): Promise<void> {
  const channel = options.channel ?? NotificationChannel.EMAIL;
  const locales = options.locales ?? ["en"];

  for (const locale of locales) {
    const isArabic = locale.startsWith("ar");

    await prisma.notificationTemplate.upsert({
      where: {
        key_locale_channel: { key: options.key, locale, channel },
      },
      update: {},
      create: {
        key: options.key,
        locale,
        channel,
        subjectTemplate: isArabic
          ? "المراجعة مستحقة — {{periodKey}}"
          : "Review due — {{periodKey}}",
        bodyTemplate: isArabic
          ? "توجد مراجعة مستحقة لـ {{subjectType}} {{subjectId}}."
          : "A review is due for {{subjectType}} {{subjectId}}.",
      },
    });
  }
}

/** The digest summary template, without which digest delivery cannot render. */
export async function seedDigestTemplate(
  prisma: PrismaService,
  channel: NotificationChannel = NotificationChannel.EMAIL,
): Promise<void> {
  await prisma.notificationTemplate.upsert({
    where: {
      key_locale_channel: {
        key: DIGEST_SUMMARY_TEMPLATE_KEY,
        locale: "en",
        channel,
      },
    },
    update: {},
    create: {
      key: DIGEST_SUMMARY_TEMPLATE_KEY,
      locale: "en",
      channel,
      subjectTemplate: "You have {{count}} pending notifications",
      bodyTemplate: "{{items}}",
    },
  });
}

/**
 * Seeds the four milestone templates the schedule notification subscriber
 * resolves, in the given locales.
 */
export async function seedScheduleTemplates(
  prisma: PrismaService,
  options: {
    prefix?: string;
    channel?: NotificationChannel;
    locales?: readonly string[];
  } = {},
): Promise<void> {
  const prefix = options.prefix ?? "schedule";

  for (const suffix of [
    "window-opened",
    "window-closing",
    "window-closed",
    "review-due",
  ]) {
    await seedTemplate(prisma, {
      key: `${prefix}.${suffix}`,
      channel: options.channel,
      locales: options.locales,
    });
  }
}
