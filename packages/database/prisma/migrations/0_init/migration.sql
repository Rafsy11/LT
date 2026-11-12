-- FiberOps Full Base Schema DDL (Generated from prisma/schema.prisma)
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'TECHNICIAN');

-- CreateEnum
CREATE TYPE "TicketType" AS ENUM ('PSB', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "TicketStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('PENDING_INSTALL', 'ACTIVE', 'ISOLATED', 'DISMANTLED');

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" JSONB NOT NULL,
    "hierarchy_level" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "nik" TEXT,
    "username" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "user_type" "UserType" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "telegram_chat_id" TEXT,
    "two_factor_enabled" BOOLEAN NOT NULL DEFAULT true,
    "assigned_clusters" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "device_model" TEXT,
    "app_version" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_clusters" (
    "id" TEXT NOT NULL,
    "cluster_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "center_lat" DECIMAL(10,7) NOT NULL,
    "center_lng" DECIMAL(10,7) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "network_splitters" (
    "id" TEXT NOT NULL,
    "cluster_id" TEXT NOT NULL,
    "splitter_code" TEXT NOT NULL,
    "lat" DECIMAL(10,7) NOT NULL,
    "lng" DECIMAL(10,7) NOT NULL,
    "max_ports" INTEGER NOT NULL DEFAULT 16,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "network_splitters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "sia_number" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "cluster_id" TEXT NOT NULL,
    "splitter_id" TEXT,
    "port_number" INTEGER,
    "current_attenuation" DECIMAL(6,2),
    "status" "CustomerStatus" NOT NULL DEFAULT 'PENDING_INSTALL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "ticket_number" TEXT NOT NULL,
    "ticket_type" "TicketType" NOT NULL,
    "customer_id" TEXT NOT NULL,
    "assigned_tech_id" TEXT,
    "created_by_admin_id" TEXT NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'OPEN',
    "admin_notes" TEXT,
    "assigned_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attenuation_histories" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "tech_id" TEXT NOT NULL,
    "old_attenuation" DECIMAL(6,2),
    "new_attenuation" DECIMAL(6,2) NOT NULL,
    "splitter_id" TEXT NOT NULL,
    "port_number" INTEGER NOT NULL,
    "photo_object_key" TEXT NOT NULL,
    "submitted_lat" DECIMAL(10,7) NOT NULL,
    "submitted_lng" DECIMAL(10,7) NOT NULL,
    "distance_to_splitter_m" DECIMAL(8,2),
    "is_location_flagged" BOOLEAN NOT NULL DEFAULT false,
    "client_recorded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attenuation_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action_type" TEXT NOT NULL,
    "target_entity" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "old_payload" JSONB,
    "new_payload" JSONB,
    "ip_address" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_error_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "app_version" TEXT,
    "device_info" TEXT,
    "error_message" TEXT NOT NULL,
    "stack_trace" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_error_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
CREATE UNIQUE INDEX "users_nik_key" ON "users"("nik");
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
CREATE INDEX "users_role_id_idx" ON "users"("role_id");
CREATE INDEX "users_is_active_idx" ON "users"("is_active");
CREATE INDEX "users_nik_idx" ON "users"("nik");
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");
CREATE INDEX "user_sessions_device_id_idx" ON "user_sessions"("device_id");
CREATE INDEX "user_sessions_revoked_at_idx" ON "user_sessions"("revoked_at");
CREATE UNIQUE INDEX "network_clusters_cluster_code_key" ON "network_clusters"("cluster_code");
CREATE INDEX "network_clusters_cluster_code_idx" ON "network_clusters"("cluster_code");
CREATE INDEX "network_clusters_is_active_idx" ON "network_clusters"("is_active");
CREATE UNIQUE INDEX "network_splitters_splitter_code_key" ON "network_splitters"("splitter_code");
CREATE INDEX "network_splitters_cluster_id_idx" ON "network_splitters"("cluster_id");
CREATE INDEX "network_splitters_splitter_code_idx" ON "network_splitters"("splitter_code");
CREATE INDEX "network_splitters_is_active_idx" ON "network_splitters"("is_active");
CREATE UNIQUE INDEX "customers_sia_number_key" ON "customers"("sia_number");
CREATE INDEX "customers_sia_number_idx" ON "customers"("sia_number");
CREATE INDEX "customers_cluster_id_idx" ON "customers"("cluster_id");
CREATE INDEX "customers_splitter_id_port_number_idx" ON "customers"("splitter_id", "port_number");
CREATE INDEX "customers_status_idx" ON "customers"("status");
CREATE UNIQUE INDEX "tickets_ticket_number_key" ON "tickets"("ticket_number");
CREATE INDEX "tickets_ticket_number_idx" ON "tickets"("ticket_number");
CREATE INDEX "tickets_status_idx" ON "tickets"("status");
CREATE INDEX "tickets_assigned_tech_id_idx" ON "tickets"("assigned_tech_id");
CREATE INDEX "tickets_customer_id_idx" ON "tickets"("customer_id");
CREATE INDEX "tickets_created_by_admin_id_idx" ON "tickets"("created_by_admin_id");
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at");
CREATE UNIQUE INDEX "attenuation_histories_submission_id_key" ON "attenuation_histories"("submission_id");
CREATE INDEX "attenuation_histories_submission_id_idx" ON "attenuation_histories"("submission_id");
CREATE INDEX "attenuation_histories_ticket_id_idx" ON "attenuation_histories"("ticket_id");
CREATE INDEX "attenuation_histories_customer_id_idx" ON "attenuation_histories"("customer_id");
CREATE INDEX "attenuation_histories_tech_id_idx" ON "attenuation_histories"("tech_id");
CREATE INDEX "attenuation_histories_created_at_idx" ON "attenuation_histories"("created_at");
CREATE INDEX "activity_logs_actor_user_id_idx" ON "activity_logs"("actor_user_id");
CREATE INDEX "activity_logs_action_type_idx" ON "activity_logs"("action_type");
CREATE INDEX "activity_logs_target_entity_target_id_idx" ON "activity_logs"("target_entity", "target_id");
CREATE INDEX "activity_logs_created_at_idx" ON "activity_logs"("created_at");
CREATE INDEX "client_error_logs_user_id_idx" ON "client_error_logs"("user_id");
CREATE INDEX "client_error_logs_created_at_idx" ON "client_error_logs"("created_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "network_splitters" ADD CONSTRAINT "network_splitters_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "network_clusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_cluster_id_fkey" FOREIGN KEY ("cluster_id") REFERENCES "network_clusters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "customers" ADD CONSTRAINT "customers_splitter_id_fkey" FOREIGN KEY ("splitter_id") REFERENCES "network_splitters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigned_tech_id_fkey" FOREIGN KEY ("assigned_tech_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_created_by_admin_id_fkey" FOREIGN KEY ("created_by_admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attenuation_histories" ADD CONSTRAINT "attenuation_histories_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attenuation_histories" ADD CONSTRAINT "attenuation_histories_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attenuation_histories" ADD CONSTRAINT "attenuation_histories_tech_id_fkey" FOREIGN KEY ("tech_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "attenuation_histories" ADD CONSTRAINT "attenuation_histories_splitter_id_fkey" FOREIGN KEY ("splitter_id") REFERENCES "network_splitters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "client_error_logs" ADD CONSTRAINT "client_error_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PostgreSQL Partial Unique Index for Splitter Port Concurrency Locking
-- Enforces Law 3: Prevents double-booking of active physical splitter ports
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_splitter_port
ON customers (splitter_id, port_number)
WHERE status = 'ACTIVE' AND splitter_id IS NOT NULL AND port_number IS NOT NULL;

-- =============================================================================
-- Enterprise Security: Immutable Audit Trail Triggers (Law 2: APPEND-ONLY)
-- Prevents UPDATE and DELETE on audit-critical tables.
-- =============================================================================

-- Trigger function: blocks UPDATE on attenuation_histories
CREATE OR REPLACE FUNCTION prevent_audit_tampering()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'SECURITY VIOLATION: Modifying records in audit table "%" is forbidden. This table is APPEND-ONLY (Law 2).', TG_TABLE_NAME;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Prevent UPDATE on attenuation_histories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attenuation_histories_no_update'
  ) THEN
    CREATE TRIGGER trg_attenuation_histories_no_update
    BEFORE UPDATE ON attenuation_histories
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();
  END IF;
END;
$$;

-- Prevent DELETE on attenuation_histories
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_attenuation_histories_no_delete'
  ) THEN
    CREATE TRIGGER trg_attenuation_histories_no_delete
    BEFORE DELETE ON attenuation_histories
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();
  END IF;
END;
$$;

-- Prevent UPDATE on activity_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_activity_logs_no_update'
  ) THEN
    CREATE TRIGGER trg_activity_logs_no_update
    BEFORE UPDATE ON activity_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();
  END IF;
END;
$$;

-- Prevent DELETE on activity_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_activity_logs_no_delete'
  ) THEN
    CREATE TRIGGER trg_activity_logs_no_delete
    BEFORE DELETE ON activity_logs
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_tampering();
  END IF;
END;
$$;
