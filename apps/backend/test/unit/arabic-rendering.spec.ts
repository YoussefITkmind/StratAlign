import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationTemplateService } from "../../src/modules/notifications/template/template.service";
import { TemplateRenderer } from "../../src/modules/notifications/template/template.renderer";
import type { PrismaService } from "../../src/database/prisma.service";
import { createLogger } from "../../src/logging/logger";
import { NotificationChannel } from "../../src/generated/prisma/enums";

/**
 * Arabic is one of the two locales the frontend already ships, and it is the
 * only right-to-left one, so it gets its own coverage rather than riding along
 * with the English cases.
 *
 * The renderer is byte-transparent: it must not normalise, reorder, reshape or
 * strip directional marks. Anything clever here would corrupt real messages.
 */
const renderer = new TemplateRenderer();

const ARABIC_SUBJECT = "المراجعة مستحقة — {{periodKey}}";
const ARABIC_BODY = [
  "توجد مراجعة مستحقة لـ {{subjectType}} {{subjectId}}.",
  "",
  "الفترة: {{periodKey}}",
  "الاستحقاق: {{reviewDueAt}} ({{timezone}})",
].join("\n");

describe("Arabic placeholder rendering", () => {
  it("substitutes into Arabic text without altering the surrounding script", () => {
    const result = renderer.render(ARABIC_SUBJECT, { periodKey: "2026-08" });

    expect(result).toBe("المراجعة مستحقة — 2026-08");
  });

  it("renders a full multi-line Arabic body", () => {
    const result = renderer.render(ARABIC_BODY, {
      subjectType: "kpi_collection",
      subjectId: "kpi-42",
      periodKey: "2026-08",
      reviewDueAt: "2026-08-06T09:00:00.000Z",
      timezone: "Asia/Dubai",
    });

    expect(result).toContain("الفترة: 2026-08");
    expect(result).toContain("الاستحقاق: 2026-08-06T09:00:00.000Z (Asia/Dubai)");
    expect(result.split("\n")).toHaveLength(4);
  });

  it("preserves Arabic values substituted into an English template", () => {
    const result = renderer.render("Owner: {{owner}}", { owner: "أحمد" });

    expect(result).toBe("Owner: أحمد");
  });

  it("preserves Arabic-Indic digits verbatim", () => {
    // These must not be normalised to ASCII digits.
    const result = renderer.render("العدد: {{count}}", { count: "٣" });

    expect(result).toBe("العدد: ٣");
    expect(result).not.toContain("3");
  });

  it("preserves a right-to-left mark inside a value", () => {
    const rightToLeftMark = "‏";
    const result = renderer.render("{{label}}", {
      label: `${rightToLeftMark}مراجعة`,
    });

    expect(result).toBe(`${rightToLeftMark}مراجعة`);
    expect(result.codePointAt(0)).toBe(0x200f);
  });

  it("joins an Arabic digest item list with newlines", () => {
    const result = renderer.render("{{items}}", {
      items: ["• المراجعة الأولى", "• المراجعة الثانية"],
    });

    expect(result).toBe("• المراجعة الأولى\n• المراجعة الثانية");
  });

  it("reports missing placeholders in an Arabic template", () => {
    expect(() => renderer.render(ARABIC_SUBJECT, {})).toThrow(/periodKey/);
  });
});

describe("Arabic locale selection", () => {
  let findMany: ReturnType<typeof vi.fn>;
  let service: NotificationTemplateService;

  const arabicRow = {
    key: "schedule.review-due",
    locale: "ar",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: ARABIC_SUBJECT,
    bodyTemplate: "توجد مراجعة مستحقة.",
  };

  const englishRow = {
    key: "schedule.review-due",
    locale: "en",
    channel: NotificationChannel.EMAIL,
    subjectTemplate: "Review due — {{periodKey}}",
    bodyTemplate: "A review is due.",
  };

  function withStored(rows: (typeof arabicRow)[]): void {
    findMany.mockImplementation(
      async (args: { where: { locale: { in: string[] } } }) =>
        rows.filter((row) => args.where.locale.in.includes(row.locale)),
    );
  }

  beforeEach(() => {
    findMany = vi.fn();

    service = new NotificationTemplateService(
      { notificationTemplate: { findMany } } as unknown as PrismaService,
      renderer,
      { defaultLocale: "en", fallbackLocale: "en" },
      createLogger("error"),
    );
  });

  it("selects the Arabic template for an Arabic recipient", async () => {
    withStored([englishRow, arabicRow]);

    const result = await service.render(
      "schedule.review-due",
      NotificationChannel.EMAIL,
      service.buildLocaleCandidates("ar"),
      { periodKey: "2026-08" },
    );

    expect(result.locale).toBe("ar");
    expect(result.subject).toBe("المراجعة مستحقة — 2026-08");
  });

  it("degrades ar-SA to ar before falling back to English", async () => {
    withStored([englishRow, arabicRow]);

    const result = await service.render(
      "schedule.review-due",
      NotificationChannel.EMAIL,
      service.buildLocaleCandidates("ar-SA"),
      { periodKey: "2026-08" },
    );

    // A regional template is an optional refinement, not a requirement.
    expect(result.locale).toBe("ar");
  });

  it("falls back to English when no Arabic template exists", async () => {
    withStored([englishRow]);

    const result = await service.render(
      "schedule.review-due",
      NotificationChannel.EMAIL,
      service.buildLocaleCandidates("ar"),
      { periodKey: "2026-08" },
    );

    expect(result.locale).toBe("en");
    expect(result.subject).toBe("Review due — 2026-08");
  });

  it("refuses to substitute Arabic for a recipient who asked for English", async () => {
    withStored([arabicRow]);

    // Fallback only ever walks towards the configured default (en), never
    // sideways into an unrelated language. Sending Arabic to a recipient who
    // requested English would be a worse outcome than a visible failure, so
    // this fails permanently and the reason is recorded on the delivery.
    await expect(
      service.render(
        "schedule.review-due",
        NotificationChannel.EMAIL,
        service.buildLocaleCandidates("en"),
        { periodKey: "2026-08" },
      ),
    ).rejects.toThrow("No notification template matched");
  });
});
