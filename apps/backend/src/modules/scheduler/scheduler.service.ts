import { Injectable, NotFoundException } from '@nestjs/common';
import { CadenceRepository } from './cadence.repository';
import { CadenceGeneratorService } from './cadence-generator.service';
import {
  CadenceDefinition,
  CadenceInstance,
  CadenceType,
  CadenceStatus,
} from '@prisma/client';

@Injectable()
export class SchedulerService {
  constructor(
    private readonly repository: CadenceRepository,
    private readonly generator: CadenceGeneratorService,
  ) {}

  async createCadence(data: {
    name: string;
    cadenceType: CadenceType;
    dayOffset: number;
    warningLeadDays: number;
    active?: boolean;
  }): Promise<CadenceDefinition> {
    return this.repository.createDefinition(data);
  }

  async generateFutureInstances(
    cadenceDefinitionId: string,
    periodCalendarId: string,
    horizonMonths: number,
  ): Promise<CadenceInstance[]> {
    const definition = await this.repository.getDefinition(cadenceDefinitionId);
    if (!definition) {
      throw new NotFoundException(
        `Cadence definition with ID ${cadenceDefinitionId} not found`,
      );
    }

    const calendar = await this.repository.getCalendar(periodCalendarId);
    if (!calendar) {
      throw new NotFoundException(
        `Period calendar with ID ${periodCalendarId} not found`,
      );
    }

    const generatedPeriods = this.generator.generatePeriods(
      definition,
      calendar,
      horizonMonths,
    );
    const instances: CadenceInstance[] = [];

    for (const p of generatedPeriods) {
      // Idempotent check
      let instance = await this.repository.findInstance(
        cadenceDefinitionId,
        p.periodRef,
      );
      if (!instance) {
        instance = await this.repository.createInstance({
          cadenceDefinitionId,
          periodRef: p.periodRef,
          dueAt: p.dueAt,
          openedAt: p.openedAt,
          closingAt: p.closingAt,
          closedAt: p.closedAt,
          status: CadenceStatus.PENDING,
        });
      } else {
        // If it exists, update the schedule dates to make it idempotent
        // but don't overwrite if it's already closed
        if (instance.status !== CadenceStatus.CLOSED) {
          instance = await this.repository.updateInstanceDates(instance.id, {
            dueAt: p.dueAt,
            openedAt: p.openedAt,
            closingAt: p.closingAt,
            closedAt: p.closedAt,
          });
        }
      }
      instances.push(instance);
    }

    return instances;
  }

  async regenerateCadence(
    cadenceDefinitionId: string,
    periodCalendarId: string,
    horizonMonths: number,
  ): Promise<CadenceInstance[]> {
    const definition = await this.repository.getDefinition(cadenceDefinitionId);
    if (!definition) {
      throw new NotFoundException(
        `Cadence definition with ID ${cadenceDefinitionId} not found`,
      );
    }

    // Delete non-closed instances first to perform clean start
    await this.repository.deleteNonClosedInstances(cadenceDefinitionId);

    return this.generateFutureInstances(
      cadenceDefinitionId,
      periodCalendarId,
      horizonMonths,
    );
  }

  async getUpcomingInstances(): Promise<CadenceInstance[]> {
    return this.repository.getNonClosedInstances();
  }
}
