# Event persistence stage

1. Run `db/003_events.sql` after the previous migrations.
2. Set `DATABASE_URL`.
3. Create/connect a Vercel Blob store and set `BLOB_READ_WRITE_TOKEN`.
4. `/admin` stays protected by AGAYO ID permissions. `/admin-preview` is a visual-only route and must be removed before production launch.
5. Publishing through the event editor writes the event and ticket categories to PostgreSQL. Public home/events/event/checkout pages read the database first and retain the current static catalogue only as a safe fallback while setup is incomplete.
6. Poster uploads go to Vercel Blob; the returned URL becomes the event hero/poster image. Palette extraction is still a later step: this stage persists the palette fields but uses the current default AGAYO/event colors until automatic extraction is added.
