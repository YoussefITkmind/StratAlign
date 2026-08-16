import type { SchedulerService } from "../scheduler/scheduler.service";
import { ValueService } from "./value.service";

/**
 * Adds scheduler integration to the core ValueService without teaching the
 * generic scheduler anything about benefits. Closing a benefit first creates
 * the durable Checkin rows, then gives each one an ADHOC cadence whose opaque
 * subject points back to that check-in. The worker-side subscriber owns the
 * domain reaction when the scheduler later emits reviewDue.
 */
export class ScheduledValueService extends ValueService {
  constructor(
    prisma: ConstructorParameters<typeof ValueService>[0],
    governance: ConstructorParameters<typeof ValueService>[1],
    governanceEscalation: ConstructorParameters<typeof ValueService>[2],
    rules: ConstructorParameters<typeof ValueService>[3],
    private readonly scheduler: SchedulerService,
  ) {
    super(prisma, governance, governanceEscalation, rules);
  }

  override async transition(input: Parameters<ValueService["transition"]>[0]) {
    const benefit = await super.transition(input);
    if (benefit.lifecycle_state !== "closure") return benefit;

    const checkins = await this.listCheckins(benefit.id);
    for (const checkin of checkins) {
      await this.scheduler.createDefinition({
        key: `value-checkin-${checkin.months_post_delivery}m-${checkin.id}`,
        name: `Value check-in ${checkin.months_post_delivery} months`,
        description: `Post-delivery value realization check-in for benefit ${benefit.id}`,
        subjectType: "value_checkin",
        subjectId: checkin.id,
        payload: {
          benefitId: benefit.id,
          monthsPostDelivery: checkin.months_post_delivery,
        },
        cadence: {
          type: "ADHOC",
          runAt: checkin.due_at.toISOString(),
        },
        timezone: "UTC",
        startsAt: input.now ?? new Date(),
        anchorAt: input.now ?? new Date(),
        reviewDueOffsetMinutes: 0,
      });
    }

    return benefit;
  }
}
