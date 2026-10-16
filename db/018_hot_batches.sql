-- Rolling five-ticket promotion batches. This does not change ticket inventory,
-- pricing, reservations or issued tickets. Existing enabled promotions start a
-- new batch at migration time; old manual displayed_remaining is discarded.
ALTER TABLE public.event_ticket_categories ADD COLUMN IF NOT EXISTS hot_batch_started_at timestamptz;
UPDATE public.event_ticket_categories SET hot_batch_started_at=now(),hot_displayed_remaining=NULL
WHERE hot_enabled=true AND hot_batch_started_at IS NULL;
CREATE INDEX IF NOT EXISTS orders_hot_paid_idx ON public.orders(event_slug,paid_at,id) WHERE paid_at IS NOT NULL AND total>0;
CREATE INDEX IF NOT EXISTS order_items_hot_units_idx ON public.order_items(order_id,ticket_category_id) INCLUDE(quantity);
