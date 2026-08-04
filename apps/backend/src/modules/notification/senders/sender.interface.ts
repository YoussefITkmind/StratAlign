export interface SendOptions {
  recipient: string; // email address, webhook URL, or identifier
  subject: string;
  body: string;
}

export interface NotificationSender {
  send(options: SendOptions): Promise<void>;
}
