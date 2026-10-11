-- AGAYO editable public pages. Apply after db/002_admin_access.sql.
-- The authenticated /api/admin/about publication also initializes this exact
-- additive table if it is missing; public requests never initialize schema.
CREATE TABLE IF NOT EXISTS public.site_pages (
  page_key text PRIMARY KEY,
  content jsonb NOT NULL CHECK (jsonb_typeof(content) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_by uuid REFERENCES public.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
