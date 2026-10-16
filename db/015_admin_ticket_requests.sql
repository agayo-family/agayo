-- AGAYO: direct invitations, JSON repair and durable refund reconciliation.
-- Apply after migrations 001..014; authenticated writes also initialize this schema.

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
CREATE TABLE IF NOT EXISTS personal_ticket_requests (
  request_id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES users(id),
  campaign_id uuid NOT NULL UNIQUE REFERENCES personal_ticket_campaigns(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Older postgres.js calls inferred jsonb for a JSON string and encoded twice.
-- Only authenticated preparation repairs those rows; public reads never do DDL.
DO $repair$ DECLARE r record; decoded jsonb; BEGIN
  FOR r IN SELECT id,levels,recipients FROM personal_ticket_campaigns
    WHERE jsonb_typeof(levels)='string' OR jsonb_typeof(recipients)='string' LOOP
    BEGIN
      decoded := CASE WHEN jsonb_typeof(r.levels)='string' THEN (r.levels #>> '{}')::jsonb ELSE r.levels END;
      IF jsonb_typeof(decoded)='array' THEN UPDATE personal_ticket_campaigns SET levels=decoded WHERE id=r.id; END IF;
      decoded := CASE WHEN jsonb_typeof(r.recipients)='string' THEN (r.recipients #>> '{}')::jsonb ELSE r.recipients END;
      IF jsonb_typeof(decoded)='array' THEN UPDATE personal_ticket_campaigns SET recipients=decoded WHERE id=r.id; END IF;
    EXCEPTION WHEN invalid_text_representation THEN NULL;
    END;
  END LOOP;
END $repair$;


CREATE TABLE IF NOT EXISTS admin_refund_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), order_id uuid NOT NULL REFERENCES orders(id),
  ticket_id uuid UNIQUE REFERENCES tickets(id), actor_id uuid NOT NULL REFERENCES users(id),
  request_payload jsonb NOT NULL, reason text NOT NULL,
  status text NOT NULL DEFAULT 'unknown' CHECK(status IN ('unknown','pending','succeeded','canceled')),
  provider_refund_id text UNIQUE, first_attempt_at timestamptz, claim_until timestamptz,
  last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS admin_refund_requests_order_once ON admin_refund_requests(order_id) WHERE ticket_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS admin_refund_requests_order_active ON admin_refund_requests(order_id) WHERE status IN ('unknown','pending');
