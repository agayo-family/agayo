-- Operational admin layer: scanner/audit performance and controller attribution.
-- Apply after 001_init.sql, 002_admin_access.sql and 003_events.sql.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS used_by uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS tickets_event_status_idx ON tickets(event_slug, status);
CREATE INDEX IF NOT EXISTS orders_event_status_idx ON orders(event_slug, status);
CREATE INDEX IF NOT EXISTS promo_codes_event_active_idx ON promo_codes(event_slug, is_active);
