import type { PrismaService } from "../../database/prisma.service";
import {
  NotificationChannel,
  NotificationDeliveryMode,
} from "../../generated/prisma/enums";

export interface EffectivePreference {
  recipientUserId: string;
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
 * Notification preferences are resolved against the IAM User record using
 * `recipientUserId`.
 * address can come from. Until IAM lands, recipients without a row get the
 * platform defaults and whatever address the caller supplied.
 */
export class NotificationPreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly defaults: PreferenceDefaults,
  ) {}

  async resolve(
    recipientUserId: string,
    channel: NotificationChannel,
  ): Promise<EffectivePreference> {
    const [stored, user] = await Promise.all([
      this.prisma.notificationPreference.findUnique({
        where: {
          recipientUserId_channel: { recipientUserId, channel },
        },
      }),
      this.prisma.user.findUnique({
        where: { id: recipientUserId },
        select: { preferredLocale: true },
      }),
    ]);

    if (!stored) {
      return {
        recipientUserId,
        channel,
        deliveryMode: NotificationDeliveryMode.IMMEDIATE,
        digestIntervalMinutes: this.defaults.digestIntervalMinutes,
        locale: user?.preferredLocale ?? this.defaults.locale,
        timezone: this.defaults.timezone,
        address: null,
        mutedTemplateKeys: [],
        isEnabled: true,
        isExplicit: false,
      };
    }

    return {
      recipientUserId: stored.recipientUserId,
      channel: stored.channel,
      deliveryMode: stored.deliveryMode,
      digestIntervalMinutes: stored.digestIntervalMinutes,
      locale: stored.locale ?? user?.preferredLocale ?? this.defaults.locale,
      timezone: stored.timezone,
      address: stored.address,
      mutedTemplateKeys: stored.mutedTemplateKeys,
      isEnabled: stored.isEnabled,
      isExplicit: true,
    };
  }

  /** All recipients with deferred work waiting, for the digest sweep. */
  async resolveMany(
    pairs: readonly { recipientUserId: string; channel: NotificationChannel }[],
  ): Promise<Map<string, EffectivePreference>> {
    const resolved = new Map<string, EffectivePreference>();

    for (const pair of pairs) {
      const preference = await this.resolve(pair.recipientUserId, pair.channel);
      resolved.set(preferenceKey(pair.recipientUserId, pair.channel), preference);
    }

    return resolved;
  }
}

export function preferenceKey(
  recipientUserId: string,
  channel: NotificationChannel,
): string {
  return `${recipientUserId}::${channel}`;
}
