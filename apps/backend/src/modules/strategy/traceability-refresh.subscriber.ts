import type { DomainEventEnvelope, EventSubscriber } from "../../events/event.types";
import type { StrategyTraversalService } from "./strategy-traversal.service";

/** Refreshes the materialized traceability read model after authoritative edge writes. */
export class TraceabilityRefreshSubscriber implements EventSubscriber {
  readonly id = "strategy-traceability-refresh";
  readonly eventTypes = ["strategy.edge.changed"] as const;

  constructor(private readonly traversal: StrategyTraversalService) {}

  async handle(envelope: DomainEventEnvelope): Promise<void> {
    if (envelope.eventType !== "strategy.edge.changed") return;
    await this.traversal.refreshTraceability();
  }
}
