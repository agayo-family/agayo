-- AGAYO v13.4 — partial ticket refunds, resumable media, loyalty visuals and NPD receipt tracking
-- Apply after db/010_account_favorites_admin.sql.

-- YooKassa supports kopecks. Keep refund totals exact instead of rounding to whole rubles.
ALTER TABLE orders
  ALTER COLUMN refunded_amount TYPE numeric(12,2)
  USING refunded_amount::numeric(12,2);

-- NPD does not use a 54-FZ cash register. AGAYO tracks the operational state of
-- the receipt that the owner creates in «Мой налог» / an authorized NPD partner.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS npd_receipt_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS npd_receipt_id text,
  ADD COLUMN IF NOT EXISTS npd_receipt_url text,
  ADD COLUMN IF NOT EXISTS npd_receipt_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS npd_receipt_updated_at timestamptz;

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_npd_receipt_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_npd_receipt_status_check
  CHECK (npd_receipt_status IN ('not_required','required','registered','reissue_required','cancel_required','cancelled'));

UPDATE orders
SET npd_receipt_status='required',
    npd_receipt_amount=COALESCE(npd_receipt_amount,total::numeric(12,2)),
    npd_receipt_updated_at=COALESCE(npd_receipt_updated_at,now())
WHERE status='paid' AND npd_receipt_status='not_required';

-- One returned ticket gets one YooKassa refund. A ticket becomes invalid after
-- the refund even when the refunded amount is only 30% or 50% of its paid share.
CREATE TABLE IF NOT EXISTS ticket_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL UNIQUE REFERENCES tickets(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  yookassa_refund_id text UNIQUE,
  refund_percent integer NOT NULL CHECK (refund_percent IN (30,50,100)),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed')),
  reason text NOT NULL DEFAULT 'customer_return',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_refunds_order_idx ON ticket_refunds(order_id,created_at DESC);

-- Stable source keys make Yandex Disk imports idempotent and resumable even if
-- the browser is closed half-way through a large folder.
ALTER TABLE media_photos
  ADD COLUMN IF NOT EXISTS source_key text;
CREATE UNIQUE INDEX IF NOT EXISTS media_photos_source_key_unique
  ON media_photos(source_key)
  WHERE source_key IS NOT NULL;

-- Each loyalty level can either define its own color palette or use an uploaded
-- image as the AGAYO ID card artwork.
ALTER TABLE loyalty_levels
  ADD COLUMN IF NOT EXISTS visual_mode text NOT NULL DEFAULT 'colors',
  ADD COLUMN IF NOT EXISTS visual_primary text NOT NULL DEFAULT '#151517',
  ADD COLUMN IF NOT EXISTS visual_secondary text NOT NULL DEFAULT '#4B0F19',
  ADD COLUMN IF NOT EXISTS visual_accent text NOT NULL DEFAULT '#C21F39',
  ADD COLUMN IF NOT EXISTS visual_image_url text;

ALTER TABLE loyalty_levels
  DROP CONSTRAINT IF EXISTS loyalty_levels_visual_mode_check;
ALTER TABLE loyalty_levels
  ADD CONSTRAINT loyalty_levels_visual_mode_check
  CHECK (visual_mode IN ('colors','image'));

-- Slightly different defaults make levels visually distinct immediately while
-- remaining inside the AGAYO palette. Administrators can replace all of them.
UPDATE loyalty_levels SET visual_primary='#151517',visual_secondary='#202023',visual_accent='#8E8E91' WHERE level_key='NEW';
UPDATE loyalty_levels SET visual_primary='#151517',visual_secondary='#4B0F19',visual_accent='#6B1F2B' WHERE level_key='INSIDE';
UPDATE loyalty_levels SET visual_primary='#0B0B0C',visual_secondary='#6B1F2B',visual_accent='#C21F39' WHERE level_key='REGULAR';
UPDATE loyalty_levels SET visual_primary='#17120B',visual_secondary='#5A3914',visual_accent='#D0A65A' WHERE level_key='GOLD';
UPDATE loyalty_levels SET visual_primary='#0B0B0C',visual_secondary='#35102A',visual_accent='#E8C7D7' WHERE level_key='LEGEND';
