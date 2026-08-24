import type { PrismaService } from "../../database/prisma.service";
import type { Connection as ConnectionRow, ConnectionStatus } from "../../generated/prisma/client";
import { integrationsErrors } from "./integrations.errors";

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
  constructor(private readonly prisma: PrismaService) {}

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

    return toView({ ...existing, ...data });
  }

  async syncNow(id: string): Promise<ConnectionView> {
    const existing = await this.prisma.connection.findUnique({ where: { id } });
    if (!existing) throw integrationsErrors.connectionNotFound();

    const updated = await this.prisma.connection.update({
      where: { id },
      data: {
        lastSyncLabel: "Last: just now",
        recordsIn: { increment: Math.floor(Math.random() * 500) },
        recordsOut: { increment: Math.floor(Math.random() * 200) },
      },
    });
    return toView(updated);
  }
}
