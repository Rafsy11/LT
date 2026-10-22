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
