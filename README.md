# AGAYO — ticket platform

Current release candidate: **v12 / payment reliability / YooKassa reconciliation**

## First deployment checklist

1. Apply PostgreSQL migrations in order:
   - `db/001_init.sql`
   - `db/002_admin_access.sql`
   - `db/003_events.sql`
   - `db/004_admin_operations.sql`
   - `db/005_event_inventory.sql`
   - `db/006_legal_checkout.sql`
   - `db/007_media.sql`
2. Configure Vercel Environment Variables using `.env.example`.
3. Deploy.
4. Log in with the email from `AGAYO_OWNER_EMAIL`.
5. Open `/admin`.
6. Keep `PAYMENTS_ENABLED=0` until YooKassa and legal/infrastructure checks are complete.

## Required integrations

- PostgreSQL / Neon: `DATABASE_URL`
- Passwordless sessions: `AUTH_SECRET`
- Resend: `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`
- SMS.RU: `SMS_RU_API_ID` (optional until phone login is enabled)
- Vercel Blob: `BLOB_READ_WRITE_TOKEN`
- YooKassa: `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`
- Public address: `NEXT_PUBLIC_SITE_URL`
- Owner: `AGAYO_OWNER_EMAIL`

## Payments

Real payment creation is blocked unless:

```env
PAYMENTS_ENABLED=1
```

Each AGAYO order is used as a stable YooKassa `Idempotence-Key`. Retryable YooKassa errors are retried with the same key, so one order cannot accidentally create several payments during a retry window.

Configure the YooKassa webhook URL as:

```text
https://YOUR-DOMAIN/api/payments/yookassa/webhook
```

Subscribe to both events:

- `payment.succeeded`
- `payment.canceled`

The webhook does not trust the notification body as the source of truth. Before changing an AGAYO order, the server reads the payment directly from YooKassa. Successful payments issue tickets idempotently; canceled payments release inventory reservations.

The return page `/checkout/success?order=...` also reconciles a pending order with YooKassa. This provides a second path to finish an order if a webhook is delayed.

### Fiscal receipt gate

If AGAYO must send receipt data through YooKassa, set:

```env
YOOKASSA_RECEIPT_REQUIRED=1
YOOKASSA_VAT_CODE=...
YOOKASSA_PAYMENT_MODE=...
YOOKASSA_PAYMENT_SUBJECT=...
```

When `YOOKASSA_RECEIPT_REQUIRED=1`, payment creation is blocked if any required receipt setting is missing. Do not guess these values: confirm them against the actual merchant/fiscalization configuration before enabling production payments.

## Ticket delivery reliability

Paid tickets are created before email delivery. Email delivery state is stored in `ticket_deliveries`:

- `pending`
- `sent`
- `failed`

Webhook retries do not create duplicate tickets and do not resend an email already marked `sent`. A temporary email-provider failure can therefore be retried safely without rolling the paid order back.

## Legal checkout

Checkout requires:
1. acceptance of the User Agreement + Public Offer + event-specific Rules;
2. a separate personal-data consent.

The order stores acceptance time, legal document version, an exact event-rules snapshot, IP and user-agent.

Legal pages:
- `/legal`
- `/legal/offer`
- `/legal/user-agreement`
- `/legal/privacy`
- `/events/[slug]/rules`

Event rules are edited per event in `/admin` using the **Правила мероприятия** button.

## Build

```bash
npm install
npm run typecheck
npm run build
```

Production deployment on Vercel also runs a Next.js build.

## Important legal/infrastructure note

The included legal texts are a production-oriented draft, not a substitute for a lawyer checking the actual event format, refund policy, merchant/fiscal settings and personal-data infrastructure. In particular, Russian personal-data localization and cross-border-transfer requirements must be checked against the actual hosting/database/email/SMS architecture before public launch.
