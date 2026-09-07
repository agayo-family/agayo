# AGAYO v13 FINAL — QA checkpoint

Date: 2026-09-07

## Static checks completed for the v13 package

- all internal `@/…` imports resolve to project files;
- no real `.env`, private key or PEM file is included in the package;
- migrations 001–008 are present;
- homepage no longer consumes the event palette;
- scanner no longer depends on browser `BarcodeDetector`;
- live ticket/profile/team event lists use database-backed event data;
- order creation locks inventory and reserves limited promo usage;
- public promo checkout rejects a 0 ₽ payment;
- payment processing handles succeeded/canceled and full refund synchronization idempotently;
- loyalty labels/thresholds are database-backed and existing users are recalculated after an edit;
- production readiness checks migration 008, AUTH_SECRET and fiscal confirmation in addition to integration variables;
- unsupported admin permissions were removed rather than shown as fake controls.

## Checks that require the real deployment

These must be completed after the user uploads v13 because they depend on external accounts/secrets:

- Vercel `npm install` / `next build`;
- migration 008 against the real Neon database;
- Resend domain and real mailbox delivery;
- Vercel Blob upload/delete in production;
- YooKassa payment/cancel/refund notifications;
- actual fiscal/online-cash-register configuration;
- real iPhone/Android camera permission and QR scan;
- last-ticket concurrency under production infrastructure.

## Release rule

Do not set `PAYMENTS_ENABLED=1` until `docs/PRODUCTION-LAUNCH.md` is completed and `/admin` → `Настройки` shows the required production items ready.
