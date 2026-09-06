-- AGAYO media management: gallery photos + reviews

CREATE TABLE IF NOT EXISTS media_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text NOT NULL,
  url text UNIQUE NOT NULL,
  caption text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS media_photos_event_idx ON media_photos(event_slug, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS media_photos_public_idx ON media_photos(is_published, created_at DESC);

CREATE TABLE IF NOT EXISTS media_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text,
  author text NOT NULL,
  body text NOT NULL DEFAULT '',
  audio_url text,
  is_featured boolean NOT NULL DEFAULT false,
  is_published boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(trim(body)) > 0 OR audio_url IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS media_reviews_event_idx ON media_reviews(event_slug, sort_order, created_at DESC);
CREATE INDEX IF NOT EXISTS media_reviews_public_idx ON media_reviews(is_published, is_featured, created_at DESC);


-- Seed the current public archive into the editable gallery on first migration.
INSERT INTO media_photos(event_slug,url,caption,sort_order,is_featured,is_published)
VALUES
('agayo-night','https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=1800&q=88','',10,true,true),
('agayo-night','https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=1800&q=88','',20,false,true),
('agayo-night','https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=1800&q=88','',30,false,true),
('agayo-night','https://images.unsplash.com/photo-1524368535928-5b5e00ddc76b?auto=format&fit=crop&w=1800&q=88','',40,false,true),
('summer-01','https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=1800&q=88','',10,true,true),
('summer-01','https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=1800&q=88','',20,false,true),
('summer-01','https://images.unsplash.com/photo-1521337581100-8ca9a73a5f79?auto=format&fit=crop&w=1800&q=88','',30,false,true),
('summer-01','https://images.unsplash.com/photo-1521336575822-6da63fb45455?auto=format&fit=crop&w=1800&q=88','',40,false,true),
('clubshow','https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1800&q=88','',10,true,true),
('clubshow','https://images.unsplash.com/photo-1505236858219-8359eb29e329?auto=format&fit=crop&w=1800&q=88','',20,false,true),
('clubshow','https://images.unsplash.com/photo-1531058020387-3be344556be6?auto=format&fit=crop&w=1800&q=88','',30,false,true),
('clubshow','https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=1800&q=88','',40,false,true)
ON CONFLICT (url) DO NOTHING;

INSERT INTO media_reviews(event_slug,author,body,is_featured,is_published,sort_order)
SELECT NULL,'Алина, 16','Я вообще не хотела идти. Хорошо, что друзья заставили.',true,true,10
WHERE NOT EXISTS (
  SELECT 1 FROM media_reviews WHERE author='Алина, 16' AND body='Я вообще не хотела идти. Хорошо, что друзья заставили.'
);
