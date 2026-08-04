import { Injectable, Logger } from '@nestjs/common';
import { NotificationSender, SendOptions } from './sender.interface';

@Injectable()
export class ConsoleSender implements NotificationSender {
  private readonly logger = new Logger(ConsoleSender.name);

  async send(options: SendOptions): Promise<void> {
    await Promise.resolve();
    this.logger.log(
      `[CONSOLE SEND] Recipient: ${options.recipient}\nSubject: ${options.subject}\nBody: ${options.body}`,
    );
  }
}
