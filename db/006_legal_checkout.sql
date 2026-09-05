-- AGAYO legal checkout + per-event rules
-- Apply after 005_event_inventory.sql.

ALTER TABLE login_codes
  ADD COLUMN IF NOT EXISTS request_ip text;


ALTER TABLE events
  ADD COLUMN IF NOT EXISTS event_rules text NOT NULL DEFAULT '';

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS legal_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS legal_version text,
  ADD COLUMN IF NOT EXISTS event_rules_snapshot text,
  ADD COLUMN IF NOT EXISTS legal_acceptance_ip text,
  ADD COLUMN IF NOT EXISTS legal_acceptance_user_agent text;

CREATE INDEX IF NOT EXISTS orders_legal_accepted_idx
  ON orders(legal_accepted_at)
  WHERE legal_accepted_at IS NOT NULL;
