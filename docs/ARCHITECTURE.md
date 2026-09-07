# AGAYO v13 — production architecture

## Public flow

- `/` — branded AGAYO home. The event changes only the hero background image; interface colors remain AGAYO brand colors.
- `/events` — published events and archive.
- `/events/[slug]` — database-backed event page.
- `/events/[slug]/checkout` — server-priced checkout with promo and legal consent.
- `/checkout/success` — payment reconciliation/status.
- `/auth` — passwordless AGAYO ID login.
- `/profile` — real user tickets, visits and loyalty.
- `/tickets/[token]` — server-backed digital ticket with opaque QR token.
- `/gallery` — editable published media.
- `/legal/*` — legal documents and event rules.

## Source of truth

PostgreSQL is the source of truth for users, sessions, events, ticket inventory, orders, promos, tickets, loyalty and admin access. Client-side UI never decides payment state, ticket validity or final price.

Vercel Blob stores admin-managed poster/media assets. Resend sends OTP and ticket emails. SMS.RU is optional for phone login.

## Payment lifecycle

checkout → transaction locks inventory/promo → pending order + reservations → YooKassa payment → authoritative YooKassa verification → paid order → tickets issued → email delivery recorded.

`payment.canceled` releases inventory and promo reservations. `refund.succeeded` is verified against YooKassa; a successful full refund makes the order/tickets refunded.

Stable idempotence keys and row locks make payment/webhook retries safe.

## Inventory and promos

- Ticket category inventory is checked under a database lock before order creation.
- Pending orders reserve quantity in `ticket_inventory_reservations`.
- Limited promos reserve a usage in `promo_code_reservations` while payment is pending.
- Paid orders consume both reservations.
- Canceled orders release both reservations.
- Public promo checkout never creates a 0 ₽ YooKassa payment.

## QR entrance control

Every ticket has a cryptographically random opaque QR token. No personal data is encoded in the QR.

`/admin/scanner` uses `@zxing/browser` over the normal camera API. The server atomically changes only a `valid` ticket to `used`, records the controller and first-use time, and rejects repeated/refunded/cancelled tickets.

## AGAYO ID and loyalty

Tickets are attached to the user created/found by checkout email. Used tickets become visits. Loyalty labels and thresholds are stored in `loyalty_levels` and editable by an authorized admin; existing users are recalculated after threshold changes.

## Admin security

`/admin` is server-gated by an HttpOnly AGAYO ID session. Roles are presets; actual authority comes from granular permissions stored in PostgreSQL. Event-scoped access is enforced server-side. Critical mutations are written to `admin_audit_log`.

Only permissions backed by a real production action are exposed in v13.

## Production gates

The system status screen checks:

- PostgreSQL connection and migration 008 schema;
- final `AUTH_SECRET`;
- Resend configuration;
- Blob configuration;
- YooKassa credentials and payment switch;
- explicit fiscalization confirmation;
- production HTTPS URL;
- owner email.

`PAYMENTS_ENABLED=1` and `FISCALIZATION_CONFIRMED=1` are intentional final switches, not defaults.

See `docs/PRODUCTION-LAUNCH.md`.
