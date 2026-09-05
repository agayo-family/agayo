# AGAYO release candidate QA

Date: 2026-09-05

## Automated checks completed

- Parsed every TypeScript / TSX source file with the TypeScript parser: **73 files, 0 parse errors**.
- Ran a dependency-independent TypeScript semantic pass with temporary ambient stubs: **0 application-level type errors**.
- Checked all internal `@/…` imports: **0 missing local modules**.
- Checked external imports against `package.json`: **0 undeclared packages**.
- Checked CSS brace balance: **0 imbalance**.
- Tested calendar badge logic in Moscow timezone:
  - future + open => tickets
  - future + closed => soon
  - today + coming-soon => soon
  - past + open => archive
- Checked legal checkout path at code level:
  - client blocks payment until both required consents are checked;
  - server independently rejects missing document acceptance;
  - server independently rejects missing personal-data consent;
  - order stores legal version, acceptance timestamps, exact event-rules snapshot, IP and user-agent.
- Checked event rules path at code level:
  - per-event field stored in PostgreSQL;
  - admin editor can edit/reset rules;
  - published rules have a public route;
  - draft rules require admin preview access;
  - checkout links to the exact event rules.
- Checked OTP / SMS code path at code level:
  - SMS.RU adapter validates Russian phone format;
  - destination rate limit exists;
  - IP rate limit exists after migration 006;
  - failed delivery removes the unused login code;
  - successful code consumption is guarded against a second concurrent use.
- Checked payment safety at code level:
  - payment creation is disabled unless `PAYMENTS_ENABLED=1`;
  - YooKassa credentials remain server-only;
  - fiscal VAT code is no longer guessed automatically.

## Checks that still require the real deployment

These cannot be truthfully certified without the external services and the final Vercel build:

- `npm install` + real `next build` (package download timed out in the working environment).
- Vercel production build.
- Neon migration 006 against the actual database.
- Resend delivery to a real mailbox.
- SMS.RU delivery to a real phone.
- Vercel Blob poster upload.
- YooKassa test/real payment, webhook and refund.
- Real iPhone / Android camera QR scan.
- Cross-device concurrency test for the last ticket.
- Russian personal-data localization / cross-border infrastructure compliance.

## Release rule

Keep `PAYMENTS_ENABLED=0` until the external integration checklist is completed.
