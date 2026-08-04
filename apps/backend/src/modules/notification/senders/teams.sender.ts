import { Injectable, Logger } from '@nestjs/common';
import { NotificationSender, SendOptions } from './sender.interface';

@Injectable()
export class TeamsSender implements NotificationSender {
  private readonly logger = new Logger(TeamsSender.name);

  async send(options: SendOptions): Promise<void> {
    const url = options.recipient;

    if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
      this.logger.log(
        `[MOCK TEAMS SEND] Channel Webhook: ${options.recipient}\nSubject: ${options.subject}\nBody: ${options.body}`,
      );
      return;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'message',
          attachments: [
            {
              contentType: 'application/vnd.microsoft.card.adaptive',
              content: {
                type: 'AdaptiveCard',
                body: [
                  {
                    type: 'TextBlock',
                    size: 'Medium',
                    weight: 'Bolder',
                    text: options.subject,
                  },
                  {
                    type: 'TextBlock',
                    text: options.body,
                    wrap: true,
                  },
                ],
                $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                version: '1.2',
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.logger.log(`Teams message successfully sent to webhook`);
    } catch (error) {
      this.logger.error(
        `Failed to send Teams message: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
