import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { NotificationSender, SendOptions } from './sender.interface';

@Injectable()
export class EmailSender implements NotificationSender {
  private readonly logger = new Logger(EmailSender.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT
      ? parseInt(process.env.SMTP_PORT, 10)
      : 587;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: {
          user,
          pass,
        },
      });
    } else {
      this.logger.warn(
        'SMTP configuration is incomplete. EmailSender will run in mock mode.',
      );
    }
  }

  async send(options: SendOptions): Promise<void> {
    if (!this.transporter) {
      this.logger.log(
        `[MOCK EMAIL SEND] To: ${options.recipient}\nSubject: ${options.subject}\nBody: ${options.body}`,
      );
      return;
    }

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: options.recipient,
        subject: options.subject,
        text: options.body,
      });
      this.logger.log(`Email successfully sent to ${options.recipient}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${options.recipient}: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
