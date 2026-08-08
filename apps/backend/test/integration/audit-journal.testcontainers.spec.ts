import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { execFileSync } from "node:child_process";
import { PrismaService } from "../../src/database/prisma.service";
import { JournalService } from "../../src/modules/audit/journal.service";

describe("Audit journal hash chain", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let prisma: PrismaService;
  let journal: JournalService;

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
  }, 120_000);

  afterAll(async () => {
    await prisma?.disconnect();
    await container?.stop();
  });

  beforeEach(async () => {
    await prisma.journalEntry.deleteMany();
  });

  it("creates a valid hash chain for multiple entries", async () => {
    for (let index = 1; index <= 5; index += 1) {
      await journal.append({
        eventType: "test.event",
        aggregateType: "test",
        aggregateId: `aggregate-${index}`,
        payload: {
          index,
          message: `event-${index}`,
        },
        actorUserId: `user-${index}`,
        correlationId: "correlation-1",
        occurredAt: new Date(`2026-08-08T12:00:0${index}.000Z`),
      });
    }

    const entries = await prisma.journalEntry.findMany({
      orderBy: {
        sequenceNumber: "asc",
      },
    });

    expect(entries).toHaveLength(5);

    expect(
      entries.map((entry) => entry.sequenceNumber),
    ).toEqual([1n, 2n, 3n, 4n, 5n]);

    expect(entries[0]?.previousHash).toBeNull();

    for (let index = 1; index < entries.length; index += 1) {
      expect(entries[index]?.previousHash)
        .toBe(entries[index - 1]?.entryHash);
    }

    const result = await journal.verifyChain();

    expect(result).toEqual({
      valid: true,
      checkedEntries: 5,
      brokenSequenceNumber: null,
      brokenEntryId: null,
      reason: null,
    });
  });

  it("detects tampering with a historical journal entry", async () => {
    for (let index = 1; index <= 3; index += 1) {
      await journal.append({
        eventType: "test.event",
        aggregateType: "test",
        aggregateId: `aggregate-${index}`,
        payload: {
          index,
        },
        occurredAt: new Date(`2026-08-08T12:00:0${index}.000Z`),
      });
    }

    const second = await prisma.journalEntry.findUniqueOrThrow({
      where: {
        sequenceNumber: 2n,
      },
    });

    await prisma.journalEntry.update({
      where: {
        id: second.id,
      },
      data: {
        payload: {
          index: 999,
          tampered: true,
        },
      },
    });

    const result = await journal.verifyChain();

    expect(result.valid).toBe(false);
    expect(result.brokenSequenceNumber).toBe(2n);
    expect(result.brokenEntryId).toBe(second.id);
    expect(result.reason).toContain("entryHash");
  });

it("does not create a second journal entry for the same source event", async () => {
  const sourceEventId = "domain-event-duplicate-1";

  const first = await journal.append({
    sourceEventId,
    eventType: "iam.role.granted",
    aggregateType: "user",
    aggregateId: "user-123",
    payload: {
      roleName: "platform_administrator",
    },
    actorUserId: "admin-123",
    correlationId: "correlation-duplicate",
    occurredAt: new Date("2026-08-08T13:00:00.000Z"),
  });

  const second = await journal.append({
    sourceEventId,
    eventType: "iam.role.granted",
    aggregateType: "user",
    aggregateId: "user-123",
    payload: {
      roleName: "platform_administrator",
    },
    actorUserId: "admin-123",
    correlationId: "correlation-duplicate",
    occurredAt: new Date("2026-08-08T13:00:00.000Z"),
  });

  expect(second.id).toBe(first.id);

  const entries = await prisma.journalEntry.findMany({
    orderBy: {
      sequenceNumber: "asc",
    },
  });

  expect(entries).toHaveLength(1);
  expect(entries[0]?.sourceEventId).toBe(sourceEventId);
  expect(entries[0]?.sequenceNumber).toBe(1n);

  const verification = await journal.verifyChain();

  expect(verification).toEqual({
    valid: true,
    checkedEntries: 1,
    brokenSequenceNumber: null,
    brokenEntryId: null,
    reason: null,
  });
});

});
