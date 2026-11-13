-- Extend workflow for CS Intake -> Vendor Dispatch (Address, Place, Coordinates) -> Field Execution & Latest Report Review
ALTER TYPE "TicketStatus" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "vendor_company" TEXT;

ALTER TABLE "tickets"
ADD COLUMN IF NOT EXISTS "vendor_name" TEXT,
ADD COLUMN IF NOT EXISTS "complaint_summary" TEXT,
ADD COLUMN IF NOT EXISTS "customer_phone" TEXT,
ADD COLUMN IF NOT EXISTS "service_address" TEXT NOT NULL DEFAULT '-',
ADD COLUMN IF NOT EXISTS "location_place" TEXT,
ADD COLUMN IF NOT EXISTS "target_lat" DECIMAL(10,7),
ADD COLUMN IF NOT EXISTS "target_lng" DECIMAL(10,7),
ADD COLUMN IF NOT EXISTS "dispatched_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "started_at" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "pending_payload" JSONB,
ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

