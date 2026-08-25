import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../../src/database/prisma.service";
import { ConnectionsService } from "../../src/modules/integrations/connections.service";
import type { WebhookDispatcherService } from "../../src/modules/integrations/webhook-dispatcher.service";

const connectionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const updatedAt = new Date("2026-01-01T00:00:00.000Z");

function connection(overrides: Partial<{ status: "CONNECTED" | "DISCONNECTED" }> = {}) {
  return {
    id: connectionId,
    name: "Salesforce CRM",
    category: "CRM",
    status: overrides.status ?? "CONNECTED",
    direction: "Bi-directional",
    lastSyncLabel: "Last: 2h ago",
    recordsIn: 100,
    recordsOut: 50,
    meta: "OAuth 2.0",
    color: "bg-blue-500",
    icon: "SF",
    createdAt: updatedAt,
    updatedAt,
  };
}

function harness(stored: ReturnType<typeof connection>) {
  const findUnique = vi.fn(async () => stored);
  const updateMany = vi.fn(async () => ({ count: 1 }));
  const syncLogCreate = vi.fn(async () => ({}));
  const connectionUpdate = vi.fn(async (args: { data: Record<string, unknown> }) => ({
    ...stored,
    lastSyncLabel: args.data.lastSyncLabel,
  }));

  const tx = { connection: { update: connectionUpdate }, syncLog: { create: syncLogCreate } };
  const $transaction = vi.fn(async (callback: (tx: typeof tx) => Promise<unknown>) => callback(tx));

  const prisma = {
    connection: { findUnique, updateMany },
    $transaction,
  } as unknown as PrismaService;

  const dispatch = vi.fn(async () => undefined);
  const dispatcher = { dispatch } as unknown as WebhookDispatcherService;

  return { service: new ConnectionsService(prisma, dispatcher), findUnique, updateMany, syncLogCreate, connectionUpdate, dispatch };
}

describe("ConnectionsService", () => {
  describe("syncNow", () => {
    it("writes a sync log alongside the connection update, in the same transaction", async () => {
      const test = harness(connection());

      await test.service.syncNow(connectionId);

      expect(test.connectionUpdate).toHaveBeenCalled();
      expect(test.syncLogCreate).toHaveBeenCalledTimes(1);
      const [{ data }] = test.syncLogCreate.mock.calls[0] as [{ data: Record<string, unknown> }];
      expect(data).toMatchObject({
        integrationName: "Salesforce CRM",
        status: "SUCCESS",
        color: "bg-blue-500",
        icon: "SF",
      });
      expect(typeof data.recordsIn).toBe("number");
      expect(typeof data.recordsOut).toBe("number");
    });

    it("dispatches a connection.synced webhook event after the sync commits", async () => {
      const test = harness(connection());

      await test.service.syncNow(connectionId);

      expect(test.dispatch).toHaveBeenCalledWith(
        "connection.synced",
        expect.objectContaining({ connectionId, name: "Salesforce CRM" }),
      );
    });
  });

  describe("toggle", () => {
    it("dispatches a connection.status_changed webhook event after the toggle commits", async () => {
      const test = harness(connection({ status: "CONNECTED" }));

      await test.service.toggle(connectionId);

      expect(test.dispatch).toHaveBeenCalledWith("connection.status_changed", {
        connectionId,
        name: "Salesforce CRM",
        status: "DISCONNECTED",
      });
    });
  });
});
