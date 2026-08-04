import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class EventBusService {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  emit<T = unknown>(event: string, payload: T): boolean {
    return this.eventEmitter.emit(event, payload);
  }
}
