-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('WEEK', 'MONTH', 'QUARTER', 'YEAR');

-- CreateEnum
CREATE TYPE "CadenceType" AS ENUM ('ONCE', 'INTERVAL', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'CRON');

-- CreateEnum
CREATE TYPE "CadenceStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CatchUpPolicy" AS ENUM ('FIRE_ALL', 'FIRE_LATEST_ONLY', 'SKIP_MISSED');

-- CreateEnum
CREATE TYPE "CadenceInstanceStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSING', 'CLOSED', 'REVIEW_DUE', 'COMPLETED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "DomainEventStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL', 'TEAMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('URGENT', 'NORMAL', 'LOW');

-- CreateEnum
CREATE TYPE "NotificationDeliveryMode" AS ENUM ('IMMEDIATE', 'DIGEST');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DEFERRED', 'DIGESTED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "NotificationDigestStatus" AS ENUM ('OPEN', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "period_calendars" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "period_type" "PeriodType" NOT NULL,
    "fiscal_year_start_month" INTEGER NOT NULL DEFAULT 1,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "period_calendars_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadence_definitions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "cadence_type" "CadenceType" NOT NULL,
    "cadence_config" JSONB NOT NULL,
    "period_calendar_id" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "anchor_at" TIMESTAMP(3) NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "status" "CadenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "catch_up_policy" "CatchUpPolicy" NOT NULL DEFAULT 'FIRE_LATEST_ONLY',
    "lookahead_seconds" INTEGER NOT NULL DEFAULT 300,
    "window_open_offset_minutes" INTEGER NOT NULL DEFAULT 0,
    "window_duration_minutes" INTEGER NOT NULL DEFAULT 1440,
    "closing_warning_minutes" INTEGER NOT NULL DEFAULT 60,
    "review_due_offset_minutes" INTEGER NOT NULL DEFAULT 0,
    "next_occurrence_at" TIMESTAMP(3),
    "last_materialized_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cadence_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cadence_instances" (
    "id" TEXT NOT NULL,
    "cadence_definition_id" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "occurrence_at" TIMESTAMP(3) NOT NULL,
    "period_key" TEXT,
    "period_starts_at" TIMESTAMP(3),
    "period_ends_at" TIMESTAMP(3),
    "window_opens_at" TIMESTAMP(3) NOT NULL,
    "window_closing_at" TIMESTAMP(3) NOT NULL,
    "window_closes_at" TIMESTAMP(3) NOT NULL,
    "review_due_at" TIMESTAMP(3) NOT NULL,
    "status" "CadenceInstanceStatus" NOT NULL DEFAULT 'PENDING',
    "next_transition_at" TIMESTAMP(3),
    "opened_at" TIMESTAMP(3),
    "closing_notified_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "review_notified_at" TIMESTAMP(3),
    "payload_snapshot" JSONB NOT NULL,
    "skip_reason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cadence_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domain_events" (
    "id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_version" INTEGER NOT NULL DEFAULT 1,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "status" "DomainEventStatus" NOT NULL DEFAULT 'PENDING',
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domain_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "recipient_ref" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "delivery_mode" "NotificationDeliveryMode" NOT NULL DEFAULT 'IMMEDIATE',
    "digest_interval_minutes" INTEGER NOT NULL DEFAULT 1440,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "address" TEXT,
    "muted_template_keys" TEXT[],
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_digests" (
    "id" TEXT NOT NULL,
    "recipient_ref" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "window_starts_at" TIMESTAMP(3) NOT NULL,
    "window_ends_at" TIMESTAMP(3) NOT NULL,
    "status" "NotificationDigestStatus" NOT NULL DEFAULT 'OPEN',
    "item_count" INTEGER NOT NULL DEFAULT 0,
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_digests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "recipient_ref" TEXT NOT NULL,
    "recipient_address" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "template_key" TEXT NOT NULL,
    "template_data" JSONB NOT NULL DEFAULT '{}',
    "locale" TEXT NOT NULL,
    "resolved_locale" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "delivery_mode" "NotificationDeliveryMode" NOT NULL DEFAULT 'IMMEDIATE',
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "dedupe_key" TEXT NOT NULL,
    "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_digest_summary" BOOLEAN NOT NULL DEFAULT false,
    "digest_id" TEXT,
    "source_event_id" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "provider_message_id" TEXT,
    "last_error" TEXT,
    "sent_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "period_calendars_key_key" ON "period_calendars"("key");

-- CreateIndex
CREATE INDEX "cadence_definitions_status_next_occurrence_at_idx" ON "cadence_definitions"("status", "next_occurrence_at");

-- CreateIndex
CREATE INDEX "cadence_definitions_period_calendar_id_idx" ON "cadence_definitions"("period_calendar_id");

-- CreateIndex
CREATE UNIQUE INDEX "cadence_definitions_subject_type_subject_id_key_key" ON "cadence_definitions"("subject_type", "subject_id", "key");

-- CreateIndex
CREATE INDEX "cadence_instances_status_next_transition_at_idx" ON "cadence_instances"("status", "next_transition_at");

-- CreateIndex
CREATE UNIQUE INDEX "cadence_instances_cadence_definition_id_occurrence_at_key" ON "cadence_instances"("cadence_definition_id", "occurrence_at");

-- CreateIndex
CREATE UNIQUE INDEX "domain_events_dedupe_key_key" ON "domain_events"("dedupe_key");

-- CreateIndex
CREATE INDEX "domain_events_status_occurred_at_idx" ON "domain_events"("status", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_locale_channel_key" ON "notification_templates"("key", "locale", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_recipient_ref_channel_key" ON "notification_preferences"("recipient_ref", "channel");

-- CreateIndex
CREATE INDEX "notification_digests_status_window_ends_at_idx" ON "notification_digests"("status", "window_ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_digests_recipient_ref_channel_window_starts_at_key" ON "notification_digests"("recipient_ref", "channel", "window_starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_dedupe_key_key" ON "notification_deliveries"("dedupe_key");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_available_at_idx" ON "notification_deliveries"("status", "available_at");

-- CreateIndex
CREATE INDEX "notification_deliveries_recipient_ref_channel_status_idx" ON "notification_deliveries"("recipient_ref", "channel", "status");

-- CreateIndex
CREATE INDEX "notification_deliveries_digest_id_idx" ON "notification_deliveries"("digest_id");

-- AddForeignKey
ALTER TABLE "cadence_definitions" ADD CONSTRAINT "cadence_definitions_period_calendar_id_fkey" FOREIGN KEY ("period_calendar_id") REFERENCES "period_calendars"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cadence_instances" ADD CONSTRAINT "cadence_instances_cadence_definition_id_fkey" FOREIGN KEY ("cadence_definition_id") REFERENCES "cadence_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_digest_id_fkey" FOREIGN KEY ("digest_id") REFERENCES "notification_digests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
