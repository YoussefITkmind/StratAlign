# Audit and Versioning

## Journal

Every audit-relevant domain event goes through the generic DomainEvent outbox and AuditEventSubscriber. JournalEntry records contain a monotonic sequence number, event and aggregate identifiers, payload, correlation and actor IDs, timestamps, previousHash, entryHash, and sourceEventId for idempotency.

JournalService.verifyChain() verifies the SHA-256 chain and reports the first broken entry. The audit.verify BullMQ worker makes this verification schedulable by Track 1.6.

## Snapshot pattern

Versioned domain modules should use SnapshotService.writeSnapshot(). When a new version becomes effective, write the domain change, emit its transactional outbox event, then write a complete snapshot with aggregateType, aggregateId, version, snapshotData, and validFrom. The helper closes the previous snapshot by setting validTo and creates the new current snapshot with validTo = null.

Future governed modules should reuse this helper rather than implement their own validity-window logic.

## Point-in-time reconstruction

SnapshotService.reconstructAsOf() first selects the snapshot valid at the requested time. If the aggregate has never used snapshots, it falls back to JournalEntry replay in sequence order.

Both audit.reconstructAsOf and audit.listEntries are restricted to platform_administrator.

## API audit tap

withAuditTap audits mutations by default and skips queries by default. Procedure meta.auditRelevant can explicitly override either default. Successful audited calls emit spm.api.call.completed through the generic outbox.

## Event classification and SIEM

Audit events are classified as security, governance, data, or content. Security events are passed to the SIEM forwarding stub, which is the extension point for a future external SIEM integration.
