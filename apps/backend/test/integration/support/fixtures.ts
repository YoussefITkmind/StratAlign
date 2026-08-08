import type { PrismaService } from "../../../src/database/prisma.service";
import { NotificationChannel } from "../../../src/generated/prisma/enums";
import { DIGEST_SUMMARY_TEMPLATE_KEY } from "../../../src/modules/notifications/digest/digest.service";

export interface SeedTemplateOptions {
  key: string;
  channel?: NotificationChannel;
}

/**
 * Seeds an English notification template for integration tests.
 */
export async function seedTemplate(
  prisma: PrismaService,
  options: SeedTemplateOptions,
): Promise<void> {
  const channel = options.channel ?? NotificationChannel.EMAIL;

  await prisma.notificationTemplate.upsert({
    where: {
      key_locale_channel: {
        key: options.key,
        locale: "en",
        channel,
      },
    },
    update: {},
    create: {
      key: options.key,
      locale: "en",
      channel,
      subjectTemplate: "Review due — {{periodKey}}",
      bodyTemplate: "A review is due for {{subjectType}} {{subjectId}}.",
    },
  });
}

/**
 * Seeds the digest summary template.
 */
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
 * Seeds the four English schedule milestone templates.
 */
export async function seedScheduleTemplates(
  prisma: PrismaService,
  options: {
    prefix?: string;
    channel?: NotificationChannel;
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
    });
  }
}
