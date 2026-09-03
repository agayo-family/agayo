CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  age_label text NOT NULL DEFAULT '14+',
  city text NOT NULL DEFAULT 'Йошкар-Ола',
  venue text,
  address text,
  alcohol_free boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  sales_state text NOT NULL DEFAULT 'coming-soon' CHECK (sales_state IN ('open','closed','coming-soon')),
  ticket_mode text NOT NULL DEFAULT 'general-admission' CHECK (ticket_mode IN ('general-admission','zones','seats')),
  hero_image text,
  poster_image text,
  theme_primary text NOT NULL DEFAULT '#220708',
  theme_secondary text NOT NULL DEFAULT '#751013',
  theme_accent text NOT NULL DEFAULT '#e12622',
  description text NOT NULL DEFAULT '',
  secondary_description text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON events(starts_at DESC);

CREATE TABLE IF NOT EXISTS event_ticket_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  category_key text NOT NULL,
  name text NOT NULL,
  price integer NOT NULL CHECK (price >= 0),
  note text NOT NULL DEFAULT '',
  inventory integer,
  hot_enabled boolean NOT NULL DEFAULT false,
  hot_displayed_remaining integer CHECK (hot_displayed_remaining BETWEEN 1 AND 4),
  theme_primary text,
  theme_secondary text,
  theme_accent text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE(event_id, category_key)
);

CREATE TABLE IF NOT EXISTS event_program_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  time_label text NOT NULL,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
