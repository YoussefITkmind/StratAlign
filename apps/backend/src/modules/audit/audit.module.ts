import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditService } from './audit.service';
import { JournalService } from './journal.service';
import { HashChainService } from './hash-chain.service';
import { HashChainVerificationService } from './hash-chain-verification.service';
import { SnapshotService } from './snapshot.service';
import { AuditEventListener } from './audit-event.listener';
import { OutboxWorker } from './workers/outbox.worker';
import { VerificationWorker } from './workers/verification.worker';
import { WithAuditTapMiddleware } from '../../common/middleware/with-audit-tap.middleware';
import { ConsoleSIEMSender } from './siem/console-siem-sender';
import { AuditController } from './audit.controller';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: 'outbox-queue',
      },
      {
        name: 'audit-verification-queue',
      },
    ),
  ],
  controllers: [AuditController],
  providers: [
    AuditService,
    JournalService,
    HashChainService,
    HashChainVerificationService,
    SnapshotService,
    AuditEventListener,
    OutboxWorker,
    VerificationWorker,
    WithAuditTapMiddleware,
    ConsoleSIEMSender,
    {
      provide: 'SIEMSender',
      useClass: ConsoleSIEMSender,
    },
  ],
  exports: [
    AuditService,
    JournalService,
    HashChainService,
    HashChainVerificationService,
    SnapshotService,
    WithAuditTapMiddleware,
    ConsoleSIEMSender,
    'SIEMSender',
    BullModule,
  ],
})
export class AuditModule {}
