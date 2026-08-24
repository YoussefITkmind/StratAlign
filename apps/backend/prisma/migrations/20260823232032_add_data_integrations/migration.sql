-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "integrations";

-- CreateEnum
CREATE TYPE "integrations"."ConnectionStatus" AS ENUM ('connected', 'error', 'disconnected', 'pending');

-- CreateEnum
CREATE TYPE "integrations"."SyncLogStatus" AS ENUM ('success', 'failed', 'partial', 'running');

-- CreateEnum
CREATE TYPE "integrations"."ApiKeyScope" AS ENUM ('read', 'write', 'admin');

-- CreateTable
CREATE TABLE "integrations"."connections" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" "integrations"."ConnectionStatus" NOT NULL DEFAULT 'pending',
    "direction" TEXT NOT NULL,
    "last_sync_label" TEXT NOT NULL,
    "records_in" INTEGER NOT NULL DEFAULT 0,
    "records_out" INTEGER NOT NULL DEFAULT 0,
    "meta" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations"."sync_logs" (
    "id" TEXT NOT NULL,
    "integration_name" TEXT NOT NULL,
    "started_label" TEXT NOT NULL,
    "duration_label" TEXT NOT NULL,
    "status" "integrations"."SyncLogStatus" NOT NULL,
    "records_in" INTEGER,
    "records_out" INTEGER,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations"."api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "integrations"."ApiKeyScope" NOT NULL DEFAULT 'read',
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "last_used_label" TEXT NOT NULL DEFAULT 'Never',
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations"."webhooks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "success_rate" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "connections_status_idx" ON "integrations"."connections"("status");

-- CreateIndex
CREATE INDEX "connections_category_idx" ON "integrations"."connections"("category");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "integrations"."sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_created_at_idx" ON "integrations"."sync_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_hash_key" ON "integrations"."api_keys"("key_hash");

-- CreateIndex
CREATE INDEX "api_keys_owner_id_idx" ON "integrations"."api_keys"("owner_id");

-- CreateIndex
CREATE INDEX "api_keys_disabled_idx" ON "integrations"."api_keys"("disabled");
