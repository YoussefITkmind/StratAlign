import { describe, it, expect } from 'vitest';
import { TemplateRendererService } from '../src/modules/notification/template-renderer.service';
import { NotificationTemplate, NotificationChannel } from '@prisma/client';

describe('TemplateRendererService - Localization', () => {
  const service = new TemplateRendererService();

  const mockTemplate: NotificationTemplate = {
    id: 'test-id',
    key: 'review-due',
    channel: NotificationChannel.EMAIL,
    subjectEn: 'Review Due for {{period}}',
    subjectAr: 'Review Due for {{period}}',
    bodyEn: 'Hello {{name}}, your review for {{period}} is due.',
    bodyAr: 'Hello {{name}}, your review for {{period}} is due now.',
    digestible: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should render English template correctly', () => {
    const result = service.render(mockTemplate, 'EN', {
      name: 'John',
      period: 'January 2026',
    });

    expect(result.subject).toBe('Review Due for January 2026');
    expect(result.body).toBe(
      'Hello John, your review for January 2026 is due.',
    );
  });

  it('should render Arabic template correctly', () => {
    const result = service.render(mockTemplate, 'AR', {
      name: 'Ahmed',
      period: 'January 2026',
    });

    expect(result.subject).toBe('Review Due for January 2026');
    expect(result.body).toBe(
      'Hello Ahmed, your review for January 2026 is due now.',
    );
  });

  it('should match Arabic snapshot output', () => {
    const result = service.render(mockTemplate, 'AR', {
      name: 'Ahmed',
      period: 'January 2026',
    });

    expect(result).toMatchInlineSnapshot(`
      {
        "body": "Hello Ahmed, your review for January 2026 is due now.",
        "subject": "Review Due for January 2026",
      }
    `);
  });
});
