import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  vi,
  beforeEach,
} from 'vitest';
import { setupTestEnvironment, TestEnvironment } from './db-test-helper';
import { SchedulerWorker } from '../src/modules/scheduler/workers/scheduler.worker';
import { CadenceRepository } from '../src/modules/scheduler/cadence.repository';
import { EventBusService } from '../src/common/prisma/../../common/event-bus/event-bus.service';
import { CadenceStatus, CadenceType } from '@prisma/client';
import {
  SCHEDULE_EVENTS,
  ScheduleEventPayload,
} from '../src/modules/scheduler/events/schedule.events';

describe('Scheduler Worker & State Transitions', () => {
  let env: TestEnvironment;
  let worker: SchedulerWorker;
  let mockEventBus: EventBusService;

  const emitSpy = vi.fn();

  beforeAll(async () => {
    env = await setupTestEnvironment();
    mockEventBus = {
      emit: emitSpy,
    } as unknown as EventBusService;

    worker = new SchedulerWorker(
      new CadenceRepository(env.prisma),
      mockEventBus,
    );
  });

  beforeEach(() => {
    emitSpy.mockClear();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('should process state transitions and emit appropriate events in chronological order', async () => {
    // 1. Create a definition
    const def = await env.prisma.cadenceDefinition.create({
      data: {
        name: 'Check Cycle Def',
        cadenceType: CadenceType.MONTHLY,
        dayOffset: 5,
        warningLeadDays: 2,
      },
    });

    const now = new Date();
    const openedAt = new Date(now.getTime() - 60000); // 1 min ago
    const dueAt = new Date(now.getTime() + 60000); // 1 min from now
    const closingAt = new Date(now.getTime() + 120000); // 2 mins from now
    const closedAt = new Date(now.getTime() + 180000); // 3 mins from now

    // 2. Create instance in PENDING status
    let instance = await env.prisma.cadenceInstance.create({
      data: {
        cadenceDefinitionId: def.id,
        periodRef: '2026-01',
        openedAt,
        dueAt,
        closingAt,
        closedAt,
        status: CadenceStatus.PENDING,
      },
    });

    // --- STEP 1: PENDING -> OPEN (openedAt reached) ---
    await worker.checkInstances();

    instance = await env.prisma.cadenceInstance.findUniqueOrThrow({
      where: { id: instance.id },
    });
    expect(instance.status).toBe(CadenceStatus.OPEN);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toBe(SCHEDULE_EVENTS.WINDOW_OPENED);
    const payload = emitSpy.mock.calls[0][1] as ScheduleEventPayload;
    expect(payload.instanceId).toBe(instance.id);

    // Reset spy
    emitSpy.mockClear();

    // --- STEP 2: OPEN -> OPEN with dueEventEmitted = true (dueAt reached) ---
    // Advance time virtually by shifting dates
    await env.prisma.cadenceInstance.update({
      where: { id: instance.id },
      data: {
        dueAt: new Date(now.getTime() - 10000), // 10s ago
      },
    });

    await worker.checkInstances();

    instance = await env.prisma.cadenceInstance.findUniqueOrThrow({
      where: { id: instance.id },
    });
    expect(instance.status).toBe(CadenceStatus.OPEN);
    expect(instance.dueEventEmitted).toBe(true);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toBe(SCHEDULE_EVENTS.REVIEW_DUE);

    emitSpy.mockClear();

    // --- STEP 3: OPEN -> CLOSING (closingAt reached) ---
    await env.prisma.cadenceInstance.update({
      where: { id: instance.id },
      data: {
        closingAt: new Date(now.getTime() - 10000), // 10s ago
      },
    });

    await worker.checkInstances();

    instance = await env.prisma.cadenceInstance.findUniqueOrThrow({
      where: { id: instance.id },
    });
    expect(instance.status).toBe(CadenceStatus.CLOSING);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toBe(SCHEDULE_EVENTS.WINDOW_CLOSING);

    emitSpy.mockClear();

    // --- STEP 4: CLOSING -> CLOSED (closedAt reached) ---
    await env.prisma.cadenceInstance.update({
      where: { id: instance.id },
      data: {
        closedAt: new Date(now.getTime() - 10000), // 10s ago
      },
    });

    await worker.checkInstances();

    instance = await env.prisma.cadenceInstance.findUniqueOrThrow({
      where: { id: instance.id },
    });
    expect(instance.status).toBe(CadenceStatus.CLOSED);
    expect(emitSpy).toHaveBeenCalledTimes(1);
    expect(emitSpy.mock.calls[0][0]).toBe(SCHEDULE_EVENTS.WINDOW_CLOSED);
  });
});
