-- Inventory reservations prevent two simultaneous checkouts from selling the same last ticket.
CREATE TABLE IF NOT EXISTS ticket_inventory_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  event_slug text NOT NULL,
  category_id text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_inventory_reservations_lookup_idx
  ON ticket_inventory_reservations(event_slug, category_id, created_at DESC);
