9import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) { }

  @Get('journal')
  async getJournal(
    @Query('actorUserId') actorUserId?: string,
    @Query('occurredAtStart') occurredAtStart?: string,
    @Query('occurredAtEnd') occurredAtEnd?: string,
    @Query('aggregateType') aggregateType?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedPage = page ? parseInt(page, 10) : undefined;
    const parsedLimit = limit ? parseInt(limit, 10) : undefined;
    const parsedStart = occurredAtStart ? new Date(occurredAtStart) : undefined;
    const parsedEnd = occurredAtEnd ? new Date(occurredAtEnd) : undefined;

    return this.auditService.queryJournal({
      actorUserId,
      occurredAtStart:
        parsedStart && !isNaN(parsedStart.getTime()) ? parsedStart : undefined,
      occurredAtEnd:
        parsedEnd && !isNaN(parsedEnd.getTime()) ? parsedEnd : undefined,
      aggregateType,
      page: parsedPage && !isNaN(parsedPage) ? parsedPage : undefined,
      limit: parsedLimit && !isNaN(parsedLimit) ? parsedLimit : undefined,
    });
  }
}
