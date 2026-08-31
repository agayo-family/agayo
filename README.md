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
