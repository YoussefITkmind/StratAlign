import { Injectable } from '@nestjs/common';
import { NotificationTemplate, Locale } from '@prisma/client';

@Injectable()
export class TemplateRendererService {
  /**
   * Renders the subject and body of a template using the specified locale and parameters.
   */
  render(
    template: NotificationTemplate,
    locale: Locale,
    variables: Record<string, unknown>,
  ): { subject: string; body: string } {
    const isArabic = locale === Locale.AR;
    const subjectTemplate = isArabic ? template.subjectAr : template.subjectEn;
    const bodyTemplate = isArabic ? template.bodyAr : template.bodyEn;

    const subject = this.interpolate(subjectTemplate, variables);
    const body = this.interpolate(bodyTemplate, variables);

    return { subject, body };
  }

  private interpolate(
    text: string,
    variables: Record<string, unknown>,
  ): string {
    return text.replace(
      /\{\{\s*(\w+)\s*\}\}/g,
      (match: string, key: string) => {
        const val = variables[key];
        if (val === undefined || val === null) {
          return match;
        }
        if (
          typeof val === 'string' ||
          typeof val === 'number' ||
          typeof val === 'boolean'
        ) {
          return String(val);
        }
        if (val instanceof Date) {
          return val.toISOString();
        }
        return JSON.stringify(val);
      },
    );
  }
}
