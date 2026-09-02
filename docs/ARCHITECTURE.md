# AGAYO ticket platform — architecture checkpoint

## Public routes
- `/` — home
- `/events` — events list/archive
- `/events/[slug]` — event page
- `/events/[slug]/checkout` — reserved for purchase flow
- `/gallery` — gallery + favorites
- `/profile` — user profile
- `/profile/favorites` — saved photos
- `/legal` — seller/legal info

## Domain requirements already represented in the code model
- Ticket modes: free entry / zones / assigned seats.
- Per-category pricing.
- Manually controlled "hot tickets" displayed count (1–4), separate from real inventory.
- Published/draft/cancelled event state.
- Open/closed/coming-soon sales state.

## Backend that must be implemented before real sales
1. PostgreSQL as source of truth for events, users, orders, tickets, favorites and audit log.
2. Passwordless Email authentication.
3. YooKassa payment creation + server-side webhook verification + refunds.
4. 10-minute seat/zone inventory holds where applicable.
5. One ticket = one cryptographically random QR token; never put personal data in QR.
6. Scanner API with atomic redemption to prevent simultaneous double entry.
7. Roles: owner, admin, organizer, controller.
8. Admin event editor: copy, poster, date/time, venue, ticket mode, categories, discounts, promo codes, hot-ticket display, program, gallery and reviews.
9. Ticket states: reserved, paid, valid, used, refunded, cancelled.
10. Notification jobs: Email, Telegram, in-app.
11. Transfer rules per event and transfer audit history.
12. Export CSV/XLSX and financial/attendance reporting.

## Important security rule
YooKassa secret, database credentials, Email-provider token and Telegram bot token are server-only. They must never be exposed through `NEXT_PUBLIC_*` variables or client components.

## Digital ticket contract

The public ticket UI is now represented by `/tickets/demo-agayo-night` as a visual prototype. Production tickets must be server-backed and must not trust client-controlled status or QR data.

Required ticket states: `valid`, `used`, `refunded`, `cancelled`.

Production rules:
- ticket is created/finalized only after confirmed payment;
- one ticket has one unique QR token and grants one entry;
- first successful scan marks the ticket as used with scan time/controller;
- repeated scans show that the ticket was already used;
- refund/cancellation invalidates the QR;
- used tickets render as a memory state (“Ты был здесь”) with a link to the event gallery;
- owner/category/zone/seat/status come from the backend, never from URL params or localStorage;
- QR payload should contain an opaque signed/random token, not personal data.

## Ticket visual derived from event poster
Each event may store `posterImage` and a compact `ticketTheme` (`primary`, `secondary`, `accent`). The digital ticket consumes these values and builds a CSS gradient/ambient background plus a small poster collage element. In production, the admin event constructor should derive or let the organizer adjust these colors after uploading the poster. The QR/data layer remains structurally independent so visual themes cannot affect ticket validity.

## Purchase, identity and delivery contract
- Checkout collects a delivery email on every order. Tickets are issued only after server-side YooKassa confirmation.
- If the email does not belong to an AGAYO account, create the profile automatically and attach the paid order/tickets to it.
- Passwords are not used. Authentication is OTP-based: email code first, phone/SMS code supported as an alternative after an SMS provider is connected.
- Logout invalidates the active session; sign-in creates a new session only after OTP verification.
- Paid tickets are emailed to the checkout email. Email should contain event summary + secure link to the ticket; QR generation remains server-side.
- If Telegram is linked and ticket delivery is enabled, mirror the ticket notification/link to Telegram. This can be connected in a later integration stage without changing the order model.
- Multiple tickets in one paid order produce multiple ticket records and separate QR tokens.
- Never mark an order paid from a browser redirect alone. Trust YooKassa webhook/status verification.

## Poster-driven visual theming
- Event poster drives `ticketTheme` / `eventTheme`: primary, secondary, accent.
- Public event page uses the palette while preserving AGAYO typography, contrast and accessibility.
- Ticket categories use variants of the same event palette rather than unrelated colors.
- The digital ticket and checkout summary use the same palette and poster fragments, preserving visual continuity from event discovery to entry.
