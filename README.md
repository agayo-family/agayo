# AGAYO

Frontend prototype of the AGAYO event and ticket platform.

## Run locally
```bash
npm install
npm run dev
```

## Current state
The public UI and event-domain foundation are present. Real payments, authentication, database-backed tickets, admin tools and scanner backend are intentionally not faked on the client; their implementation plan is in `docs/ARCHITECTURE.md`.

## Profile / AGAYO ID v2
- Full visual Profile / AGAYO ID page added.
- Upcoming tickets, attended-event memories, loyalty, favorites, ticket history and account settings sections are represented.
- Favorites preview uses the existing localStorage favorites system.
- Mobile fixes included: home hero words no longer split inside words; Events archive label no longer overflows on mobile.
- Real email auth, ticket data, QR, loyalty calculations and notifications remain backend work by design.

## Backend stage
This build contains the first real server foundation: PostgreSQL schema, passwordless email login, HttpOnly sessions, server-validated orders, YooKassa redirect/webhook verification, ticket issuance, real QR generation and email delivery. See `docs/BACKEND-SETUP.md` before enabling production payments.

## Current service-access stage
The `/admin` shell is now server-gated by AGAYO ID. Granular role permissions and per-event scope are stored in PostgreSQL using `db/002_admin_access.sql`. See `docs/ADMIN-ACCESS.md`.
