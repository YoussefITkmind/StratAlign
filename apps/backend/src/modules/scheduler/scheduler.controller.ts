import { Controller, Post, Get, Body, Param } from '@nestjs/common';
import { SchedulerService } from './scheduler.service';
import { CadenceType } from '@prisma/client';

@Controller('scheduler')
export class SchedulerController {
  constructor(private readonly schedulerService: SchedulerService) {}

  @Post('cadence')
  async createCadence(
    @Body()
    body: {
      name: string;
      cadenceType: CadenceType;
      dayOffset: number;
      warningLeadDays: number;
      active?: boolean;
    },
  ) {
    return this.schedulerService.createCadence(body);
  }

  @Post('cadence/:id/generate')
  async generateFutureInstances(
    @Param('id') id: string,
    @Body()
    body: {
      calendarId: string;
      horizonMonths: number;
    },
  ) {
    return this.schedulerService.generateFutureInstances(
      id,
      body.calendarId,
      body.horizonMonths,
    );
  }

  @Post('cadence/:id/regenerate')
  async regenerateCadence(
    @Param('id') id: string,
    @Body()
    body: {
      calendarId: string;
      horizonMonths: number;
    },
  ) {
    return this.schedulerService.regenerateCadence(
      id,
      body.calendarId,
      body.horizonMonths,
    );
  }

  @Get('instances/upcoming')
  async getUpcomingInstances() {
    return this.schedulerService.getUpcomingInstances();
  }
}
