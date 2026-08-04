import { describe, it, expect } from 'vitest';
import { CadenceGeneratorService } from '../src/modules/scheduler/cadence-generator.service';
import { CadenceDefinition, PeriodCalendar, CadenceType } from '@prisma/client';

describe('CadenceGeneratorService', () => {
  const service = new CadenceGeneratorService();

  const mockCalendar: PeriodCalendar = {
    id: 'cal-2026',
    name: 'FY 2026 Gregorian',
    fiscalYear: 2026,
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-12-31T23:59:59.999Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it('should generate 12 monthly periods for a 12-month horizon', () => {
    const mockDef: CadenceDefinition = {
      id: 'def-monthly',
      name: 'Monthly Cadence',
      cadenceType: CadenceType.MONTHLY,
      dayOffset: 5,
      warningLeadDays: 3,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const periods = service.generatePeriods(mockDef, mockCalendar, 12);
    expect(periods).toHaveLength(12);

    // Verify first period
    expect(periods[0].periodRef).toBe('2026-01');
    expect(periods[0].periodStart.toISOString()).toContain('2026-01-01');

    // dueAt = Jan 1 + 5 days = Jan 6
    expect(periods[0].dueAt.toISOString()).toContain('2026-01-06');

    // openedAt = Jan 6 - 3 days = Jan 3
    expect(periods[0].openedAt.toISOString()).toContain('2026-01-03');

    // closingAt = Jan 6 + 1 day = Jan 7
    expect(periods[0].closingAt.toISOString()).toContain('2026-01-07');

    // closedAt = Jan 6 + 2 days = Jan 8
    expect(periods[0].closedAt.toISOString()).toContain('2026-01-08');

    // Verify last period
    expect(periods[11].periodRef).toBe('2026-12');
  });

  it('should limit monthly periods based on a shorter horizon', () => {
    const mockDef: CadenceDefinition = {
      id: 'def-monthly',
      name: 'Monthly Cadence',
      cadenceType: CadenceType.MONTHLY,
      dayOffset: 15,
      warningLeadDays: 5,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const periods = service.generatePeriods(mockDef, mockCalendar, 6);
    expect(periods).toHaveLength(6);
    expect(periods[5].periodRef).toBe('2026-06');
  });

  it('should generate 4 quarterly periods for a 12-month horizon', () => {
    const mockDef: CadenceDefinition = {
      id: 'def-quarterly',
      name: 'Quarterly Cadence',
      cadenceType: CadenceType.QUARTERLY,
      dayOffset: 10,
      warningLeadDays: 5,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const periods = service.generatePeriods(mockDef, mockCalendar, 12);
    expect(periods).toHaveLength(4);

    expect(periods[0].periodRef).toBe('2026-Q1');
    expect(periods[0].periodStart.toISOString()).toContain('2026-01-01');
    // dueAt = Jan 1 + 10 days = Jan 11
    expect(periods[0].dueAt.toISOString()).toContain('2026-01-11');

    expect(periods[3].periodRef).toBe('2026-Q4');
    expect(periods[3].periodStart.toISOString()).toContain('2026-10-01');
  });

  it('should generate 1 single period for ADHOC cadence', () => {
    const mockDef: CadenceDefinition = {
      id: 'def-adhoc',
      name: 'Adhoc Cadence',
      cadenceType: CadenceType.ADHOC,
      dayOffset: 0,
      warningLeadDays: 0,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const periods = service.generatePeriods(mockDef, mockCalendar, 12);
    expect(periods).toHaveLength(1);
    expect(periods[0].periodRef).toBe('2026-ADHOC');
    expect(periods[0].periodStart.toISOString()).toContain('2026-01-01');
    expect(periods[0].periodEnd.toISOString()).toContain('2026-12-31');
  });
});
