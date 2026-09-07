# AGAYO — ticket platform

Current release candidate: **v13 FINAL / production launch**

This build is the production-oriented AGAYO ticket platform: dynamic events, checkout, YooKassa payments, AGAYO ID, email tickets, QR entrance control, editable media, promo codes, loyalty and protected admin tools.

## What changed in v13

- The home page keeps the AGAYO brand palette permanently. The nearest event can change only the hero background image.
- QR scanning no longer depends on the experimental browser `BarcodeDetector`. It uses `@zxing/browser` over the normal camera API and keeps manual token/link entry as fallback.
- Live tickets, AGAYO ID and team event scopes now use database-backed events instead of the old static demo event list.
- Limited promo codes reserve their usage while a payment is pending, preventing concurrent overuse.
- Public promo codes cannot reduce a checkout to 0 ₽.
- YooKassa reconciliation handles `payment.succeeded`, `payment.canceled` and `refund.succeeded`.
- Full refunds made in YooKassa invalidate AGAYO tickets automatically after the refund webhook is verified.
- Loyalty level labels and visit thresholds are editable in `/admin`; thresholds are recalculated for existing users immediately.
- The admin production screen checks the database schema, AUTH_SECRET, email, Blob, YooKassa, fiscal confirmation, production URL and owner setup without exposing secrets.
- Old public demo-ticket URLs redirect to AGAYO ID.
- Permissions that had no real production action were removed from the role editor instead of being left as decorative controls.

## Required database migrations

Apply in this exact order for a fresh database:

1. `db/001_init.sql`
2. `db/002_admin_access.sql`
3. `db/003_events.sql`
4. `db/004_admin_operations.sql`
5. `db/005_event_inventory.sql`
6. `db/006_legal_checkout.sql`
7. `db/007_media.sql`
8. `db/008_production_launch.sql`

For an existing v12 database, apply **only `db/008_production_launch.sql`**.

## Required production integrations

- Neon / PostgreSQL — `DATABASE_URL`
- Protected AGAYO ID sessions — `AUTH_SECRET`
- Resend — `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`
- Vercel Blob — `BLOB_READ_WRITE_TOKEN`
- YooKassa — `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`
- Public HTTPS address — `NEXT_PUBLIC_SITE_URL`
- Initial owner account — `AGAYO_OWNER_EMAIL`
- SMS.RU — optional; email login works without it

Use `.env.example` as the complete variable list. Never commit the real values to GitHub.

## Production gate

Real payment creation remains blocked until:

```env
PAYMENTS_ENABLED=1
```

In addition, v13 requires explicit confirmation that the fiscalization/receipt scheme has actually been checked:

```env
FISCALIZATION_CONFIRMED=1
```

Do **not** set either flag just to make the admin screen green. First complete the launch procedure in `docs/PRODUCTION-LAUNCH.md`.

If AGAYO must send receipt data in the YooKassa payment request, also set:

```env
YOOKASSA_RECEIPT_REQUIRED=1
YOOKASSA_VAT_CODE=...
YOOKASSA_PAYMENT_MODE=...
YOOKASSA_PAYMENT_SUBJECT=...
```

The application intentionally does not guess these fiscal values.

## YooKassa webhook

Configure:

```text
https://YOUR-DOMAIN/api/payments/yookassa/webhook
```

Subscribe to:

- `payment.succeeded`
- `payment.canceled`
- `refund.succeeded`

Webhook JSON is treated only as a trigger. AGAYO reads the authoritative payment/refund object directly from YooKassa before changing the order.

## Ticket reliability

A successful payment:

1. marks the order paid exactly once;
2. consumes the inventory reservation;
3. consumes a promo reservation exactly once;
4. issues ticket records exactly once;
5. stores email delivery status in `ticket_deliveries`;
6. safely retries failed email delivery from the success/status path without duplicating a sent email.

A canceled payment releases inventory and promo reservations. A successful full refund marks the order and its tickets as refunded.

## QR scanner

`/admin/scanner` requires the `scan_tickets` permission.

Camera scanning uses `@zxing/browser` and the browser camera API. In production the site must be served over HTTPS and the operator must grant camera permission. Manual token/link entry remains available if the device camera cannot be used.

## Legal checkout

Checkout requires:

1. User Agreement + Public Offer + event-specific Rules;
2. separate personal-data consent.

The order stores acceptance time, legal version, an exact event-rules snapshot, IP and user-agent.

Legal pages:

- `/legal`
- `/legal/offer`
- `/legal/user-agreement`
- `/legal/privacy`
- `/events/[slug]/rules`

The included legal texts are production-oriented drafts. They still require review against the actual organizer, event/refund policy, personal-data infrastructure and fiscal setup before public sales.

## Build

```bash
npm install
npm run typecheck
npm run build
```

Vercel performs the production Next.js build after deployment.


## v13.1 — flexible loyalty
После `db/008_production_launch.sql` примените `db/009_flexible_loyalty.sql`. Она добавляет произвольные условия уровней и ручное назначение уровня пользователю с внутренним комментарием.

Я крутой
