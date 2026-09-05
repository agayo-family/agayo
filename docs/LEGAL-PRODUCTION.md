# Legal / production launch notes

## Checkout documents

The user must accept:
- User Agreement
- Public Offer
- event-specific Rules

Personal-data consent is intentionally a separate checkbox.

## Per-event rules

Open `/admin` → Events → edit event → **Правила мероприятия**.

The saved rules:
- are available at `/events/<slug>/rules`;
- are linked from the event page and checkout;
- are snapshotted into the order at purchase time.

## Database

Apply `db/006_legal_checkout.sql` after migration 005.

## YooKassa

Keep `PAYMENTS_ENABLED=0` during setup. Switch to `1` only after:
- shop credentials are valid;
- webhook is configured and tested;
- fiscal receipt/VAT settings are confirmed;
- public legal documents are reviewed;
- refund flow is tested.

## SMS.RU

Set `SMS_RU_API_ID`.
Optional:
- `SMS_RU_FROM` for an approved sender;
- `SMS_RU_TEST=1` during API testing.

## Personal data

Before public launch, verify that the actual infrastructure complies with Russian localization, operator notification and any applicable cross-border transfer requirements. Do not assume that a privacy-policy text alone makes the infrastructure compliant.
