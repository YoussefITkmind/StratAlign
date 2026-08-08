import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import { PrismaService } from "../../src/database/prisma.service";
import { JournalService } from "../../src/modules/audit/journal.service";
import { SnapshotService } from "../../src/modules/audit/snapshot.service";

describe("Audit snapshot reconstruction", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let journal: JournalService;
  let snapshots: SnapshotService;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16")
      .withDatabase("test")
      .withUsername("user")
      .withPassword("pass")
      .start();

    const databaseUrl = container.getConnectionUri();

    execFileSync(
      "pnpm",
      ["exec", "prisma", "migrate", "deploy"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DATABASE_URL: databaseUrl,
        },
        stdio: "inherit",
      },
    );

    prisma = new PrismaService(databaseUrl);
    await prisma.connect();

    journal = new JournalService(prisma);
    snapshots = new SnapshotService(prisma);
  }, 120_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.entitySnapshot.deleteMany();
    await prisma.journalEntry.deleteMany();
  });

  it("opens and closes snapshot validity windows correctly", async () => {
    const v1From = new Date("2026-01-01T00:00:00.000Z");
    const v2From = new Date("2026-04-01T00:00:00.000Z");
    const v3From = new Date("2026-07-01T00:00:00.000Z");

    await snapshots.writeSnapshot({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      version: 1,
      snapshotData: { version: 1, name: "Version One" },
      validFrom: v1From,
    });

    await snapshots.writeSnapshot({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      version: 2,
      snapshotData: { version: 2, name: "Version Two" },
      validFrom: v2From,
    });

    await snapshots.writeSnapshot({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      version: 3,
      snapshotData: { version: 3, name: "Version Three" },
      validFrom: v3From,
    });

    const rows = await prisma.entitySnapshot.findMany({
      where: {
        aggregateType: "fake-rule",
        aggregateId: "rule-1",
      },
      orderBy: {
        version: "asc",
      },
    });

    expect(rows).toHaveLength(3);

    expect(rows[0]?.validFrom).toEqual(v1From);
    expect(rows[0]?.validTo).toEqual(v2From);

    expect(rows[1]?.validFrom).toEqual(v2From);
    expect(rows[1]?.validTo).toEqual(v3From);

    expect(rows[2]?.validFrom).toEqual(v3From);
    expect(rows[2]?.validTo).toBeNull();
  });

  it("reconstructAsOf returns the correct snapshot before, during, and after version changes", async () => {
    await snapshots.writeSnapshot({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      version: 1,
      snapshotData: { version: 1, value: "A" },
      validFrom: new Date("2026-01-01T00:00:00.000Z"),
    });

    await snapshots.writeSnapshot({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      version: 2,
      snapshotData: { version: 2, value: "B" },
      validFrom: new Date("2026-04-01T00:00:00.000Z"),
    });

    await snapshots.writeSnapshot({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      version: 3,
      snapshotData: { version: 3, value: "C" },
      validFrom: new Date("2026-07-01T00:00:00.000Z"),
    });

    const beforeV2 = await snapshots.reconstructAsOf({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      asOf: new Date("2026-03-01T00:00:00.000Z"),
    });

    const duringV2 = await snapshots.reconstructAsOf({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      asOf: new Date("2026-05-01T00:00:00.000Z"),
    });

    const afterV3 = await snapshots.reconstructAsOf({
      aggregateType: "fake-rule",
      aggregateId: "rule-1",
      asOf: new Date("2026-08-01T00:00:00.000Z"),
    });

    expect(beforeV2?.source).toBe("snapshot");
    expect(beforeV2?.version).toBe(1);
    expect(beforeV2?.data).toEqual({ version: 1, value: "A" });

    expect(duringV2?.source).toBe("snapshot");
    expect(duringV2?.version).toBe(2);
    expect(duringV2?.data).toEqual({ version: 2, value: "B" });

    expect(afterV3?.source).toBe("snapshot");
    expect(afterV3?.version).toBe(3);
    expect(afterV3?.data).toEqual({ version: 3, value: "C" });
  });

  it("falls back to replay when no snapshots exist", async () => {
    await journal.append({
      eventType: "fake.updated",
      aggregateType: "fake-aggregate",
      aggregateId: "agg-1",
      payload: {
        name: "First",
        score: 10,
      },
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    await journal.append({
      eventType: "fake.updated",
      aggregateType: "fake-aggregate",
      aggregateId: "agg-1",
      payload: {
        score: 20,
        status: "active",
      },
      occurredAt: new Date("2026-02-01T00:00:00.000Z"),
    });

    const result = await snapshots.reconstructAsOf({
      aggregateType: "fake-aggregate",
      aggregateId: "agg-1",
      asOf: new Date("2026-03-01T00:00:00.000Z"),
    });

    expect(result?.source).toBe("replay");
    expect(result?.version).toBeNull();
    expect(result?.data).toEqual({
      name: "First",
      score: 20,
      status: "active",
    });
  });

it("replay reconstruction is equivalent to snapshot reconstruction", async () => {
  const asOf = new Date("2026-06-01T00:00:00.000Z");

  const expectedState = {
    name: "Quarterly Rule",
    score: 25,
    status: "active",
  };

  // Aggregate using the snapshot mechanism.
  await snapshots.writeSnapshot({
    aggregateType: "equivalence-snapshot",
    aggregateId: "aggregate-1",
    version: 1,
    snapshotData: expectedState,
    validFrom: new Date("2026-01-01T00:00:00.000Z"),
  });

  // Equivalent aggregate reconstructed only from journal events.
  await journal.append({
    eventType: "fake.created",
    aggregateType: "equivalence-replay",
    aggregateId: "aggregate-1",
    payload: {
      name: "Quarterly Rule",
      score: 10,
    },
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
  });

  await journal.append({
    eventType: "fake.updated",
    aggregateType: "equivalence-replay",
    aggregateId: "aggregate-1",
    payload: {
      score: 25,
      status: "active",
    },
    occurredAt: new Date("2026-04-01T00:00:00.000Z"),
  });

  const snapshotResult = await snapshots.reconstructAsOf({
    aggregateType: "equivalence-snapshot",
    aggregateId: "aggregate-1",
    asOf,
  });

  const replayResult = await snapshots.reconstructAsOf({
    aggregateType: "equivalence-replay",
    aggregateId: "aggregate-1",
    asOf,
  });

  expect(snapshotResult?.source).toBe("snapshot");
  expect(replayResult?.source).toBe("replay");

  expect(snapshotResult?.data).toEqual(expectedState);
  expect(replayResult?.data).toEqual(expectedState);

  expect(replayResult?.data).toEqual(snapshotResult?.data);
});

});
