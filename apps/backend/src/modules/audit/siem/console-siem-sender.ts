import { Injectable, Logger } from '@nestjs/common';
import { SIEMSender, SIEMLogOptions } from './siem-sender.interface';

@Injectable()
export class ConsoleSIEMSender implements SIEMSender {
  private readonly logger = new Logger(ConsoleSIEMSender.name);

  async send(options: SIEMLogOptions): Promise<void> {
    await Promise.resolve();
    const metaStr = options.metadata
      ? ` | Metadata: ${JSON.stringify(options.metadata)}`
      : '';
    this.logger.log(
      `[SIEM LOG] [${options.classification.toUpperCase()}] Event: ${options.event} | Message: ${options.message}${metaStr}`,
    );
  }
}
