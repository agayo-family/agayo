-- Applied explicitly or by the first authenticated personal-ticket preparation.

CREATE TABLE IF NOT EXISTS personal_ticket_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_slug text NOT NULL,
  category_id text NOT NULL, title text NOT NULL, description text NOT NULL DEFAULT '',
  levels jsonb NOT NULL, recipients jsonb NOT NULL, created_by uuid NOT NULL REFERENCES users(id),
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS personal_ticket_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES personal_ticket_campaigns(id),
  user_id uuid NOT NULL REFERENCES users(id), ticket_id uuid NOT NULL UNIQUE REFERENCES tickets(id),
  delivery_claim_until timestamptz, email_payload jsonb, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,user_id)
);
CREATE INDEX IF NOT EXISTS personal_ticket_campaigns_event_idx ON personal_ticket_campaigns(event_slug);
CREATE INDEX IF NOT EXISTS personal_ticket_grants_user_idx ON personal_ticket_grants(user_id,created_at DESC);
