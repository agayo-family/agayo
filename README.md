# AGAYO — ticket platform

Current release candidate: **final legal checkout / event rules / dynamic events**

## First deployment checklist

1. Apply PostgreSQL migrations in order:
   - `db/001_init.sql`
   - `db/002_admin_access.sql`
   - `db/003_events.sql`
   - `db/004_admin_operations.sql`
   - `db/005_event_inventory.sql`
   - `db/006_legal_checkout.sql`
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

`YOOKASSA_VAT_CODE` is intentionally blank in the example. Set it only after confirming the fiscal receipt settings for the actual YooKassa merchant account.

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
