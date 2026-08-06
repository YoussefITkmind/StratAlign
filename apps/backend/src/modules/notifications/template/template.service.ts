import type { PrismaService } from "../../../database/prisma.service";
import type { Logger } from "../../../logging/logger";
import { PermanentError } from "../../../errors/app.errors";
import type { NotificationChannel } from "../../../generated/prisma/enums";
import type { TemplateData, TemplateRenderer } from "./template.renderer";

export interface RenderedTemplate {
  /** The locale actually matched, which may differ from the one requested. */
  locale: string;
  subject: string;
  body: string;
}

export interface TemplateServiceConfig {
  defaultLocale: string;
  fallbackLocale: string;
}

/**
 * Resolves a template by (key, locale, channel) and renders it.
 *
 * Locale selection walks a candidate chain rather than requiring every
 * template to exist in every locale: a missing `ar` row transparently falls
 * back to `en`, and the locale that actually matched is recorded on the
 * delivery so the fallback is visible rather than silent.
 */
export class NotificationTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly renderer: TemplateRenderer,
    private readonly config: TemplateServiceConfig,
    private readonly logger: Logger,
  ) {}

  /**
   * Ordered, de-duplicated locale candidates.
   *
   * A regional locale degrades to its base language first ("ar-SA" -> "ar"),
   * because a regional template is an optional refinement, not a requirement.
   */
  buildLocaleCandidates(...requested: readonly (string | null | undefined)[]): string[] {
    const candidates: string[] = [];

    const add = (locale: string | null | undefined): void => {
      if (!locale) {
        return;
      }

      const normalized = locale.trim().toLowerCase();

      if (normalized.length === 0) {
        return;
      }

      if (!candidates.includes(normalized)) {
        candidates.push(normalized);
      }

      const base = normalized.split("-")[0];

      if (base !== normalized && !candidates.includes(base)) {
        candidates.push(base);
      }
    };

    for (const locale of requested) {
      add(locale);
    }

    add(this.config.defaultLocale);
    add(this.config.fallbackLocale);

    return candidates;
  }

  async render(
    templateKey: string,
    channel: NotificationChannel,
    localeCandidates: readonly string[],
    data: TemplateData,
  ): Promise<RenderedTemplate> {
    const templates = await this.prisma.notificationTemplate.findMany({
      where: {
        key: templateKey,
        channel,
        isActive: true,
        locale: { in: [...localeCandidates] },
      },
    });

    if (templates.length === 0) {
      // Neither the requested locale nor any fallback exists. Retrying cannot
      // create the row, so this fails permanently.
      throw new PermanentError("No notification template matched", {
        templateKey,
        channel,
        localeCandidates: [...localeCandidates],
      });
    }

    // Preserve candidate priority; the database returns rows in no order.
    const byLocale = new Map(templates.map((template) => [template.locale, template]));
    const matchedLocale = localeCandidates.find((locale) => byLocale.has(locale));
    const template = matchedLocale === undefined ? undefined : byLocale.get(matchedLocale);

    if (!template || matchedLocale === undefined) {
      throw new PermanentError("No notification template matched", {
        templateKey,
        channel,
        localeCandidates: [...localeCandidates],
      });
    }

    if (matchedLocale !== localeCandidates[0]) {
      this.logger.debug("Notification template fell back to another locale", {
        templateKey,
        channel,
        requestedLocale: localeCandidates[0],
        matchedLocale,
      });
    }

    return {
      locale: matchedLocale,
      subject: this.renderer.render(template.subjectTemplate, data),
      body: this.renderer.render(template.bodyTemplate, data),
    };
  }
}
