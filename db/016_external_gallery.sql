-- One album reference per event. Photo files and CDN URLs are never persisted.
CREATE TABLE IF NOT EXISTS event_gallery_sources (
  event_slug text PRIMARY KEY REFERENCES events(slug),
  provider text NOT NULL CHECK (provider='vk'),
  album_url text NOT NULL,
  photo_count integer NOT NULL DEFAULT 0 CHECK(photo_count>=0),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
