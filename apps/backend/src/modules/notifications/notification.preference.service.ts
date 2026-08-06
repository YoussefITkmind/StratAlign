import type { PrismaService } from "../../database/prisma.service";
import {
  NotificationChannel,
  NotificationDeliveryMode,
} from "../../generated/prisma/enums";

export interface EffectivePreference {
  recipientRef: string;
  channel: NotificationChannel;
  deliveryMode: NotificationDeliveryMode;
  digestIntervalMinutes: number;
  locale: string;
  timezone: string;
  address: string | null;
  mutedTemplateKeys: readonly string[];
  isEnabled: boolean;
  /** False when no row exists and defaults are standing in. */
  isExplicit: boolean;
}

export interface PreferenceDefaults {
  locale: string;
  timezone: string;
  digestIntervalMinutes: number;
}

/**
 * Resolves delivery preferences, falling back to configured defaults when a
 * recipient has never expressed one.
 *
 * There is no User model in this repository yet, so `recipientRef` is opaque
 * and a preference row is the only place a recipient's locale, timezone or
 * address can come from. Until IAM lands, recipients without a row get the
 * platform defaults and whatever address the caller supplied.
 */
export class NotificationPreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaults: PreferenceDefaults,
  ) {}

  async resolve(
    recipientRef: string,
    channel: NotificationChannel,
  ): Promise<EffectivePreference> {
    const stored = await this.prisma.notificationPreference.findUnique({
      where: {
        recipientRef_channel: { recipientRef, channel },
      },
    });

    if (!stored) {
      return {
        recipientRef,
        channel,
        deliveryMode: NotificationDeliveryMode.IMMEDIATE,
        digestIntervalMinutes: this.defaults.digestIntervalMinutes,
        locale: this.defaults.locale,
        timezone: this.defaults.timezone,
        address: null,
        mutedTemplateKeys: [],
        isEnabled: true,
        isExplicit: false,
      };
    }

    return {
      recipientRef: stored.recipientRef,
      channel: stored.channel,
      deliveryMode: stored.deliveryMode,
      digestIntervalMinutes: stored.digestIntervalMinutes,
      locale: stored.locale,
      timezone: stored.timezone,
      address: stored.address,
      mutedTemplateKeys: stored.mutedTemplateKeys,
      isEnabled: stored.isEnabled,
      isExplicit: true,
    };
  }

  /** All recipients with deferred work waiting, for the digest sweep. */
  async resolveMany(
    pairs: readonly { recipientRef: string; channel: NotificationChannel }[],
  ): Promise<Map<string, EffectivePreference>> {
    const resolved = new Map<string, EffectivePreference>();

    for (const pair of pairs) {
      const preference = await this.resolve(pair.recipientRef, pair.channel);
      resolved.set(preferenceKey(pair.recipientRef, pair.channel), preference);
    }

    return resolved;
  }
}

export function preferenceKey(
  recipientRef: string,
  channel: NotificationChannel,
): string {
  return `${recipientRef}::${channel}`;
}
