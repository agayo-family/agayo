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

## Admin operations v3 (working tree)
- Dashboard metrics now read real PostgreSQL orders/tickets/users and upcoming published event data.
- Promo codes have protected create/list/enable-disable APIs with permission + event-scope checks and audit logging.
- Ticket search uses real ticket/user data; buyer directory reads user/ticket history.
- `/admin/scanner` is a protected mobile-first scanner screen. Scan redemption is atomic and records the controller in `tickets.used_by`.
- `db/004_admin_operations.sql` is required for this stage.
- Mobile fixes include safer nearest-event typography and a rebuilt promo submit area.

## Event operations v4
- Existing PostgreSQL events can now be opened and edited from the service area.
- Event workspace controls publication state, sales state, date/time, venue/address, descriptions and poster replacement.
- Ticket categories are dynamic: add/remove (when unused), edit name/price/note/inventory, and show sold/remaining counts.
- Hot Tickets are database-driven: when enabled, the public scarcity badge appears only for a real remaining inventory of 1–4 and therefore does not reset on refresh.
- Event statistics now show revenue, paid/pending/failed orders, issued/used tickets, category sell-through and promo usage (financial values remain permission-gated).
- Checkout respects sold-out categories; inventory-limited DB events create atomic inventory reservations before redirecting to YooKassa.
- `db/005_event_inventory.sql` is required for inventory reservations.
- `/admin-preview` contains non-persistent sample event + statistics data so the new service UI can be reviewed without a configured database.
- Mobile correction: the home-page nearest-event title is clamped more aggressively so “ВЕРНИТЕ ЛАМПОВОСТЬ” stays inside the viewport.

## Preview testing hotfix
- /admin-preview event editor now persists test changes in browser localStorage.
- Event program editing is supported and real /admin saves program items to PostgreSQL.
- Ticket category name inputs keep focus while typing.
- Poster replacement works locally in preview; real admin still uses Vercel Blob.
- Preview dashboard seeds the upcoming event as VERNITE LAMPOVOST.
- Checkout event title wraps safely on mobile.

## Real admin stabilization (v5)

- `/admin` seeds the built-in AGAYO events into PostgreSQL on first access without overwriting later owner edits.
- Event/category/program/status changes are persisted through PostgreSQL.
- Ticket category display names no longer mutate category identity while typing, preventing focus loss.
- Poster upload is optional for saving: if Vercel Blob is not connected, all non-poster event changes still save.
- Poster upload accepts `BLOB_READ_WRITE_TOKEN`, `agayo_BLOB_READ_WRITE_TOKEN`, or another connected variable ending in `_BLOB_READ_WRITE_TOKEN`.
- Connect Vercel Blob to persist newly uploaded posters in production.
