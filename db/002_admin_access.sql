-- AGAYO ID + server-side roles and granular permissions.
ALTER TABLE users ADD COLUMN IF NOT EXISTS agayo_id text;
UPDATE users
SET agayo_id = 'AGY-' || upper(substr(replace(id::text, '-', ''), 1, 10))
WHERE agayo_id IS NULL;
ALTER TABLE users ALTER COLUMN agayo_id SET DEFAULT ('AGY-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)));
ALTER TABLE users ALTER COLUMN agayo_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_agayo_id_uidx ON users(agayo_id);

CREATE TABLE IF NOT EXISTS admin_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','administrator','organizer','controller')),
  permissions jsonb NOT NULL DEFAULT '[]'::jsonb,
  all_events boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(permissions) = 'array')
);

CREATE TABLE IF NOT EXISTS admin_event_access (
  membership_id uuid NOT NULL REFERENCES admin_memberships(id) ON DELETE CASCADE,
  event_slug text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (membership_id, event_slug)
);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  target_type text,
  target_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS admin_audit_actor_idx ON admin_audit_log(actor_user_id, created_at DESC);
