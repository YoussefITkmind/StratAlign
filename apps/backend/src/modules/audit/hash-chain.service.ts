import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class HashChainService {
  calculateHash(data: {
    action: string;
    entityType: string;
    entityId: string;
    userId: string | null;
    metadata: Record<string, unknown> | null;
    previousHash: string | null;
  }): string {
    const serializedMetadata = data.metadata
      ? JSON.stringify(data.metadata)
      : '';
    const payload = `${data.action}|${data.entityType}|${data.entityId}|${data.userId || ''}|${serializedMetadata}|${data.previousHash || ''}`;
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}
