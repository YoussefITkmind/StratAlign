import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationTemplateService } from "../../src/modules/notifications/template/template.service";
import { TemplateRenderer } from "../../src/modules/notifications/template/template.renderer";
import type { PrismaService } from "../../src/database/prisma.service";
import { createLogger } from "../../src/logging/logger";
import { PermanentError } from "../../src/errors/app.errors";
import { NotificationChannel } from "../../src/generated/prisma/enums";

interface StoredTemplate {
  key: string;
  locale: string;
  channel: NotificationChannel;
  subjectTemplate: string;
  bodyTemplate: string;
}

const EN_TEMPLATE: StoredTemplate = {
  key: "schedule.review-due",
  locale: "en",
  channel: NotificationChannel.EMAIL,
  subjectTemplate: "Review due — {{periodKey}}",
  bodyTemplate: "A review is due for {{subjectId}}.",
};

const AR_TEMPLATE: StoredTemplate = {
  key: "schedule.review-due",
  locale: "ar",
  channel: NotificationChannel.EMAIL,
  subjectTemplate: "المراجعة مستحقة — {{periodKey}}",
  bodyTemplate: "توجد مراجعة مستحقة لـ {{subjectId}}.",
};

describe("NotificationTemplateService", () => {
  let findMany: ReturnType<typeof vi.fn>;
  let service: NotificationTemplateService;

  function withStoredTemplates(templates: StoredTemplate[]): void {
    findMany.mockImplementation(
      async (args: { where: { locale: { in: string[] } } }) =>
        templates.filter((template) => args.where.locale.in.includes(template.locale)),
    );
  }

  beforeEach(() => {
    findMany = vi.fn();

    const prisma = {
      notificationTemplate: { findMany },
    } as unknown as PrismaService;

    service = new NotificationTemplateService(
      prisma,
      new TemplateRenderer(),
      { defaultLocale: "en", fallbackLocale: "en" },
      createLogger("error"),
    );
  });

  describe("buildLocaleCandidates", () => {
    it("puts the requested locale first and appends the defaults", () => {
      expect(service.buildLocaleCandidates("ar")).toEqual(["ar", "en"]);
    });

    it("degrades a regional locale to its base language", () => {
      expect(service.buildLocaleCandidates("ar-SA")).toEqual(["ar-sa", "ar", "en"]);
    });

    it("prefers an explicit request over the recipient's preference", () => {
      expect(service.buildLocaleCandidates("ar", "en")).toEqual(["ar", "en"]);
    });

    it("falls back to the preference when nothing is requested", () => {
      expect(service.buildLocaleCandidates(undefined, "ar")).toEqual(["ar", "en"]);
    });

    it("ignores empty and null values", () => {
      expect(service.buildLocaleCandidates(null, "", undefined)).toEqual(["en"]);
    });

    it("never repeats a locale", () => {
      expect(service.buildLocaleCandidates("en", "en")).toEqual(["en"]);
    });
  });

  describe("render", () => {
    it("renders the requested locale when it exists", async () => {
      withStoredTemplates([EN_TEMPLATE, AR_TEMPLATE]);

      const result = await service.render(
        "schedule.review-due",
        NotificationChannel.EMAIL,
        ["ar", "en"],
        { periodKey: "2026-08", subjectId: "kpi-1" },
      );

      expect(result.locale).toBe("ar");
      expect(result.subject).toBe("المراجعة مستحقة — 2026-08");
    });

    it("falls back to English when the requested locale has no template", async () => {
      withStoredTemplates([EN_TEMPLATE]);

      const result = await service.render(
        "schedule.review-due",
        NotificationChannel.EMAIL,
        ["ar", "en"],
        { periodKey: "2026-08", subjectId: "kpi-1" },
      );

      // The fallback is recorded, not hidden: the caller can see what was used.
      expect(result.locale).toBe("en");
      expect(result.subject).toBe("Review due — 2026-08");
    });

    it("honours candidate priority regardless of database ordering", async () => {
      // Deliberately returned in the opposite order to the candidate list.
      withStoredTemplates([AR_TEMPLATE, EN_TEMPLATE]);

      const result = await service.render(
        "schedule.review-due",
        NotificationChannel.EMAIL,
        ["en", "ar"],
        { periodKey: "2026-08", subjectId: "kpi-1" },
      );

      expect(result.locale).toBe("en");
    });

    it("fails permanently when no locale matches", async () => {
      withStoredTemplates([]);

      await expect(
        service.render("schedule.review-due", NotificationChannel.EMAIL, ["ar", "en"], {}),
      ).rejects.toThrow(PermanentError);
    });

    it("propagates a missing-placeholder failure", async () => {
      withStoredTemplates([EN_TEMPLATE]);

      await expect(
        service.render("schedule.review-due", NotificationChannel.EMAIL, ["en"], {}),
      ).rejects.toThrow(PermanentError);
    });
  });
});
