-- PostgreSQL Partial Unique Index for Splitter Port Concurrency Locking
-- Enforces Law 3: Prevents double-booking of active physical splitter ports
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_splitter_port
ON customers (splitter_id, port_number)
WHERE status = 'ACTIVE' AND splitter_id IS NOT NULL AND port_number IS NOT NULL;
