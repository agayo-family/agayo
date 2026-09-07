-- AGAYO v13 production launch hardening
-- Apply after db/007_media.sql.

-- Reserve limited promo-code usages while an order is waiting for payment.
CREATE TABLE IF NOT EXISTS promo_code_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS promo_code_reservations_active_idx
  ON promo_code_reservations(promo_code_id, created_at DESC)
  WHERE consumed_at IS NULL AND released_at IS NULL;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_amount integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS orders_pending_payment_idx
  ON orders(status, created_at DESC)
  WHERE status='pending';

-- Loyalty labels and thresholds are editable without changing user records.
CREATE TABLE IF NOT EXISTS loyalty_levels (
  level_key text PRIMARY KEY,
  display_name text NOT NULL,
  visits_required integer NOT NULL DEFAULT 0 CHECK (visits_required >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO loyalty_levels(level_key,display_name,visits_required,sort_order) VALUES
  ('NEW','NEW',0,10),
  ('INSIDE','INSIDE',1,20),
  ('REGULAR','REGULAR',3,30),
  ('GOLD','GOLD',5,40),
  ('LEGEND','LEGEND',10,50)
ON CONFLICT (level_key) DO NOTHING;
