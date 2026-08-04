import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CadenceDefinition,
  CadenceInstance,
  PeriodCalendar,
  CadenceType,
  CadenceStatus,
} from '@prisma/client';

@Injectable()
export class CadenceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createDefinition(data: {
    name: string;
    cadenceType: CadenceType;
    dayOffset: number;
    warningLeadDays: number;
    active?: boolean;
  }): Promise<CadenceDefinition> {
    return this.prisma.cadenceDefinition.create({ data });
  }

  async getDefinition(id: string): Promise<CadenceDefinition | null> {
    return this.prisma.cadenceDefinition.findUnique({ where: { id } });
  }

  async getCalendar(id: string): Promise<PeriodCalendar | null> {
    return this.prisma.periodCalendar.findUnique({ where: { id } });
  }

  async getCalendarByYear(fiscalYear: number): Promise<PeriodCalendar | null> {
    return this.prisma.periodCalendar.findFirst({ where: { fiscalYear } });
  }

  async createCalendar(data: {
    name: string;
    fiscalYear: number;
    startDate: Date;
    endDate: Date;
  }): Promise<PeriodCalendar> {
    return this.prisma.periodCalendar.create({ data });
  }

  async createInstance(data: {
    cadenceDefinitionId: string;
    periodRef: string;
    dueAt: Date;
    openedAt: Date;
    closingAt: Date;
    closedAt: Date;
    status: CadenceStatus;
  }): Promise<CadenceInstance> {
    return this.prisma.cadenceInstance.create({ data });
  }

  async findInstance(
    cadenceDefinitionId: string,
    periodRef: string,
  ): Promise<CadenceInstance | null> {
    return this.prisma.cadenceInstance.findFirst({
      where: {
        cadenceDefinitionId,
        periodRef,
      },
    });
  }

  async getInstancesForDefinition(
    cadenceDefinitionId: string,
  ): Promise<CadenceInstance[]> {
    return this.prisma.cadenceInstance.findMany({
      where: { cadenceDefinitionId },
      orderBy: { dueAt: 'asc' },
    });
  }

  async deleteInstancesForDefinition(
    cadenceDefinitionId: string,
  ): Promise<void> {
    await this.prisma.cadenceInstance.deleteMany({
      where: { cadenceDefinitionId },
    });
  }

  async updateInstanceStatus(
    id: string,
    status: CadenceStatus,
  ): Promise<CadenceInstance> {
    return this.prisma.cadenceInstance.update({
      where: { id },
      data: { status },
    });
  }

  async markDueEventEmitted(id: string): Promise<CadenceInstance> {
    return this.prisma.cadenceInstance.update({
      where: { id },
      data: { dueEventEmitted: true },
    });
  }

  async getActiveInstances(): Promise<
    (CadenceInstance & { cadenceDefinition: CadenceDefinition })[]
  > {
    return this.prisma.cadenceInstance.findMany({
      where: {
        status: {
          not: CadenceStatus.CLOSED,
        },
      },
      include: {
        cadenceDefinition: true,
      },
    });
  }

  async updateInstanceDates(
    id: string,
    data: {
      dueAt: Date;
      openedAt: Date;
      closingAt: Date;
      closedAt: Date;
    },
  ): Promise<CadenceInstance> {
    return this.prisma.cadenceInstance.update({
      where: { id },
      data,
    });
  }

  async deleteNonClosedInstances(cadenceDefinitionId: string): Promise<void> {
    await this.prisma.cadenceInstance.deleteMany({
      where: {
        cadenceDefinitionId,
        status: {
          in: [
            CadenceStatus.PENDING,
            CadenceStatus.OPEN,
            CadenceStatus.CLOSING,
          ],
        },
      },
    });
  }

  async getNonClosedInstances(): Promise<CadenceInstance[]> {
    return this.prisma.cadenceInstance.findMany({
      where: {
        status: {
          not: CadenceStatus.CLOSED,
        },
      },
      orderBy: {
        dueAt: 'asc',
      },
    });
  }
}
