import { test, expect } from '@playwright/test';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../../dist/src/app.module';
import { setupTestEnvironment, TestEnvironment } from '../db-test-helper';
import { INestApplication } from '@nestjs/common';

test.describe('SPM Platform - Playwright E2E API Testing', () => {
  let env: TestEnvironment;
  let app: INestApplication;

  test.beforeAll(async () => {
    // Setup postgres and redis test containers
    env = await setupTestEnvironment();

    // Boot real NestJS application context
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(3001);
  });

  test.afterAll(async () => {
    if (app) {
      await app.close();
    }
    await env.cleanup();
  });

  test('should return Hello World from root', async ({ request }) => {
    const response = await request.get('http://localhost:3001/');
    expect(response.status()).toBe(200);
    const text = await response.text();
    expect(text).toBe('Hello World!');
  });

  test('should register and execute WithAuditTapMiddleware on mutations', async ({
    request,
  }) => {
    // Ensure audit tables are clean
    await env.prisma.entitySnapshot.deleteMany({});
    await env.prisma.journalEntry.deleteMany({});

    // Send a POST request to create a cadence
    const response = await request.post(
      'http://localhost:3001/scheduler/cadence',
      {
        data: {
          name: 'Playwright E2E Cadence',
          cadenceType: 'MONTHLY',
          dayOffset: 1,
          warningLeadDays: 1,
        },
      },
    );

    expect(response.status()).toBe(201);
    const body = (await response.json()) as { name: string };
    expect(body.name).toBe('Playwright E2E Cadence');

    // Wait a brief moment for the event bus and BullMQ outbox worker to process the tap event
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Verify a journal entry has been created for the completed api call
    const entries = await env.prisma.journalEntry.findMany({
      where: {
        action: 'spm.api.call.completed',
      },
    });

    expect(entries.length).toBeGreaterThan(0);
    const entry = entries[0];
    expect(entry.entityType).toBe('ApiCall');
    expect(entry.entityId).toBe('POST:/scheduler/cadence');

    // Check metadata content
    const metadata = entry.metadata as Record<string, any>;
    expect(metadata.method).toBe('POST');
    expect(metadata.path).toBe('/scheduler/cadence');
    expect(metadata.statusCode).toBe(201);
  });
});
