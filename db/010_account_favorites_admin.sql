-- AGAYO v13.2 — profile names, account favorites and admin role repair
-- Apply after db/009_flexible_loyalty.sql.

-- Editable user profile fields. display_name remains for backwards compatibility
-- and is kept in sync by /api/me.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text;

-- Favorites are account data now, not browser-local state.
CREATE TABLE IF NOT EXISTS photo_favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES media_photos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, photo_id)
);

CREATE INDEX IF NOT EXISTS photo_favorites_user_created_idx
  ON photo_favorites(user_id, created_at DESC);

-- Some deployed databases retained a legacy permissions CHECK that rejects
-- valid modern permission arrays. Keep the database constraint structural only;
-- the API still validates every permission against ADMIN_PERMISSIONS.
ALTER TABLE admin_memberships
  DROP CONSTRAINT IF EXISTS admin_memberships_permissions_check;

UPDATE admin_memberships
SET permissions = '[]'::jsonb
WHERE permissions IS NULL OR jsonb_typeof(permissions) <> 'array';

ALTER TABLE admin_memberships
  ADD CONSTRAINT admin_memberships_permissions_check
  CHECK (jsonb_typeof(permissions) = 'array');
