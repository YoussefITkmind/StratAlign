import type { PrismaService } from "../../database/prisma.service";
import type { Connection as ConnectionRow, ConnectionStatus } from "../../generated/prisma/client";
import { integrationsErrors } from "./integrations.errors";
import type { WebhookDispatcherService } from "./webhook-dispatcher.service";

export interface ConnectionView {
  id: string;
  name: string;
  category: string;
  status: ConnectionStatus;
  direction: string;
  lastSync: string;
  recordsIn: number;
  recordsOut: number;
  meta: string;
  color: string;
  icon: string;
}

function toView(row: ConnectionRow): ConnectionView {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    direction: row.direction,
    lastSync: row.lastSyncLabel,
    recordsIn: row.recordsIn,
    recordsOut: row.recordsOut,
    meta: row.meta,
    color: row.color,
    icon: row.icon,
  };
}

export class ConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  async list(): Promise<ConnectionView[]> {
    const rows = await this.prisma.connection.findMany({ orderBy: { name: "asc" } });
    return rows.map(toView);
  }

  async toggle(id: string): Promise<ConnectionView> {
    const existing = await this.prisma.connection.findUnique({ where: { id } });
    if (!existing) throw integrationsErrors.connectionNotFound();

    const connecting = existing.status !== "CONNECTED";
    const data: Pick<ConnectionRow, "status" | "lastSyncLabel"> = connecting
      ? { status: "CONNECTED", lastSyncLabel: "Last: just now" }
      : { status: "DISCONNECTED", lastSyncLabel: "Disconnected just now" };

    const { count } = await this.prisma.connection.updateMany({
      where: { id, updatedAt: existing.updatedAt },
      data,
    });
    if (count === 0) {
      const stillExists = await this.prisma.connection.findUnique({ where: { id } });
      throw stillExists ? integrationsErrors.concurrentUpdate() : integrationsErrors.connectionNotFound();
    }

    void this.webhookDispatcher.dispatch("connection.status_changed", {
      connectionId: id,
      name: existing.name,
      status: data.status,
    });

    return toView({ ...existing, ...data });
  }

  async syncNow(id: string): Promise<ConnectionView> {
    const existing = await this.prisma.connection.findUnique({ where: { id } });
    if (!existing) throw integrationsErrors.connectionNotFound();

    const recordsIn = Math.floor(Math.random() * 500);
    const recordsOut = Math.floor(Math.random() * 200);
    // No real external system is wired up yet, so the sync itself is
    // simulated — but the outcome is now durably recorded, not just
    // reflected in the UI, so Sync Logs has something real to show.
    const durationLabel = `${(0.4 + Math.random() * 2.5).toFixed(1)}s`;

    const updated = await this.prisma.$transaction(async (tx) => {
      const connection = await tx.connection.update({
        where: { id },
        data: {
          lastSyncLabel: "Last: just now",
          recordsIn: { increment: recordsIn },
          recordsOut: { increment: recordsOut },
        },
      });
      await tx.syncLog.create({
        data: {
          integrationName: existing.name,
          startedLabel: "Just now",
          durationLabel,
          status: "SUCCESS",
          recordsIn,
          recordsOut,
          errorCount: 0,
          message: `Synced ${recordsIn} records in, ${recordsOut} records out`,
          color: existing.color,
          icon: existing.icon,
        },
      });
      return connection;
    });

    void this.webhookDispatcher.dispatch("connection.synced", {
      connectionId: id,
      name: existing.name,
      recordsIn,
      recordsOut,
    });

    return toView(updated);
  }
}
