-- Durable logical deletion. Keep event content, purchased tickets, orders,
-- photographs and refunds intact. Public discovery and administration exclude
-- deleted_at; a direct historical event URL remains available without sales.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS events_active_starts_at_idx ON public.events(starts_at DESC) WHERE deleted_at IS NULL;
