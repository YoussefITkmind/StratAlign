export type SIEMClassification = 'security' | 'governance' | 'data' | 'content';

export interface SIEMLogOptions {
  event: string;
  classification: SIEMClassification;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface SIEMSender {
  send(options: SIEMLogOptions): Promise<void>;
}
