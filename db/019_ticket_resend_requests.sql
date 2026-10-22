-- Optional upfront installation. Otherwise initialized only by an authorized,
-- explicit manual resend; opening the admin page never runs DDL.
CREATE TABLE IF NOT EXISTS ticket_resend_requests (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES orders(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  payload jsonb NOT NULL,
  results jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','failed')),
  claim_token uuid,
  claim_until timestamptz,
  first_attempt_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_resend_order_created_idx ON ticket_resend_requests(order_id,created_at DESC);
