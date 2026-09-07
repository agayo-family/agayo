# AGAYO v13 — backend setup

The backend is implemented. This file describes how to activate the production integrations; it is no longer a future architecture plan.

## Database

Fresh install: apply `db/001_init.sql` through `db/008_production_launch.sql` in order.

Upgrade from v12: apply only `db/008_production_launch.sql`.

## Environment

Use `.env.example` as the canonical list and set the real values only in Vercel.

Required for the first public launch:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AGAYO_OWNER_EMAIL`
- `NEXT_PUBLIC_SITE_URL`
- `EMAIL_PROVIDER_API_KEY`
- `EMAIL_FROM`
- `BLOB_READ_WRITE_TOKEN`
- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- explicit fiscalization decision

SMS.RU is optional.

## YooKassa

The webhook endpoint is `/api/payments/yookassa/webhook` and must receive:

- `payment.succeeded`
- `payment.canceled`
- `refund.succeeded`

AGAYO verifies payment/refund state by reading the object directly from YooKassa before mutating the database.

Keep `PAYMENTS_ENABLED=0` until the final end-to-end test and fiscal check are complete.

## Authentication

Email/SMS OTP → one-time code → server consumption → 30-day HttpOnly session. Email login is always available when Resend is configured. Phone login is hidden automatically when SMS.RU is not configured.

## Media

Admin poster/gallery/audio uploads use Vercel Blob and remain server-authorized.

## Detailed launch sequence

See `docs/PRODUCTION-LAUNCH.md`.
