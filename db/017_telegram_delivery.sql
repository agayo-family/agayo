-- Optional Telegram delivery. Apply before enabling the bot environment variables.
ALTER TABLE users ADD COLUMN IF NOT EXISTS ticket_delivery_preference text NOT NULL DEFAULT 'email';
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_linked_at timestamptz;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_ticket_delivery_preference_check;
ALTER TABLE users ADD CONSTRAINT users_ticket_delivery_preference_check CHECK (ticket_delivery_preference IN ('email','telegram'));

CREATE TABLE IF NOT EXISTS telegram_link_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_link_tokens_user_idx ON telegram_link_tokens(user_id,created_at DESC);

-- Telegram has no request idempotency key. A durable claim must precede I/O;
-- an ambiguous response is retained for manual reconciliation, never resent.
CREATE TABLE IF NOT EXISTS telegram_ticket_deliveries (
  delivery_key text PRIMARY KEY,
  ticket_id uuid NOT NULL REFERENCES tickets(id),
  destination_chat_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('sending','sent','failed','uncertain')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  telegram_message_id bigint,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_ticket_deliveries_ticket_idx ON telegram_ticket_deliveries(ticket_id);
CREATE INDEX IF NOT EXISTS telegram_ticket_deliveries_attention_idx ON telegram_ticket_deliveries(status,claimed_at) WHERE status IN ('sending','uncertain');
