# AGAYO v13 — production launch

This is the final operational checklist before opening public ticket sales.

## 1. Deploy v13 with payments OFF

Upload the full v13 project to GitHub and deploy it on Vercel with:

```env
PAYMENTS_ENABLED=0
FISCALIZATION_CONFIRMED=0
```

Do not accept real orders yet.

## 2. Apply the database migration

The current v12 database already has migrations 001–007. Run:

```text
db/008_production_launch.sql
```

This adds:

- pending promo usage reservations;
- refund fields on orders;
- loyalty level names/thresholds;
- production indexes.

After deployment, `/admin` → `Настройки` must show PostgreSQL/schema as ready.

## 3. Vercel environment variables

Set production values in Vercel, never in GitHub:

```env
DATABASE_URL=
AUTH_SECRET=
AGAYO_OWNER_EMAIL=
NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN

EMAIL_PROVIDER_API_KEY=
EMAIL_FROM=

BLOB_READ_WRITE_TOKEN=

YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
PAYMENTS_ENABLED=0

FISCALIZATION_CONFIRMED=0
YOOKASSA_RECEIPT_REQUIRED=0
YOOKASSA_VAT_CODE=
YOOKASSA_PAYMENT_MODE=
YOOKASSA_PAYMENT_SUBJECT=

# optional
SMS_RU_API_ID=
SMS_RU_FROM=
SMS_RU_TEST=0
```

`AUTH_SECRET` should be a high-entropy secret of at least 32 characters. Changing it later does not expose existing session tokens, but it is best to set the final value before launch.

## 4. Resend

1. Verify the production sending domain in Resend.
2. Set `EMAIL_PROVIDER_API_KEY`.
3. Set `EMAIL_FROM` to an address on the verified domain.
4. Request an AGAYO ID login code from the production site.
5. Confirm delivery to a normal mailbox, not only your own address.

Do not open sales if ticket emails cannot be delivered reliably. A paid ticket still exists in AGAYO ID if mail delivery temporarily fails, but email is part of the production purchase flow.

## 5. Vercel Blob

With `BLOB_READ_WRITE_TOKEN` configured, test from protected `/admin`:

- upload a poster;
- make it the event poster/hero image;
- upload a gallery photo;
- edit/delete a test media item;
- upload an audio review if you use voice reviews.

The homepage must keep the fixed AGAYO interface colors. Only the image behind “Создавай воспоминания, а не провалы в памяти” follows the nearest event.

## 6. YooKassa

Set the production/test-shop credentials for the environment you are testing:

```env
YOOKASSA_SHOP_ID=...
YOOKASSA_SECRET_KEY=...
```

Create this webhook in the YooKassa merchant integration settings:

```text
https://YOUR-DOMAIN/api/payments/yookassa/webhook
```

Enable notifications:

- `payment.succeeded`
- `payment.canceled`
- `refund.succeeded`

Keep `PAYMENTS_ENABLED=0` until steps 7–9 are completed.

## 7. Fiscalization / online cash register

This is an explicit launch gate because the correct values depend on the actual YooKassa/cash-register configuration.

Decide and verify which scheme the merchant account uses.

If the AGAYO payment request must include receipt items, set:

```env
YOOKASSA_RECEIPT_REQUIRED=1
YOOKASSA_VAT_CODE=<real value>
YOOKASSA_PAYMENT_MODE=<real value>
YOOKASSA_PAYMENT_SUBJECT=<real value>
```

If fiscalization is handled by another confirmed scheme and AGAYO must not attach these receipt fields, keep `YOOKASSA_RECEIPT_REQUIRED=0`.

Only after the real scheme has been confirmed set:

```env
FISCALIZATION_CONFIRMED=1
```

For refunds: v13 listens for `refund.succeeded`. A full refund made through YooKassa invalidates the AGAYO tickets. The refund receipt/fiscal process must match the fiscalization scheme you confirmed.

## 8. QR entrance scanner

Open `/admin/scanner` on the phone that will be used at the entrance.

Test over HTTPS:

1. allow camera access;
2. scan a valid AGAYO QR;
3. verify `ПРОХОД РАЗРЕШЁН`;
4. scan the same QR again;
5. verify `УЖЕ ИСПОЛЬЗОВАН` and the first-use time;
6. test a refunded/cancelled ticket — it must not pass;
7. test manual token/link entry.

The scanner no longer depends on `BarcodeDetector`; it uses ZXing over the camera stream.

## 9. Complete test order

Before public launch, create a small real/test event and run the exact customer journey:

1. event is published and sales are open;
2. poster is visible on event page;
3. ticket inventory is correct;
4. promo changes the displayed price and server total equally;
5. legal checkboxes are mandatory;
6. payment opens YooKassa;
7. success page changes from pending to paid;
8. ticket email arrives;
9. ticket appears in AGAYO ID;
10. ticket page opens from the email/AGAYO ID;
11. scanner accepts it once;
12. loyalty visit count/level updates after entry.

Also test a canceled payment and a full refund in YooKassa. Canceled payment inventory must return to sale; refunded ticket must become invalid.

## 10. Open sales

Only when `/admin` → `Настройки` has no required red items and the complete order test passes, set:

```env
PAYMENTS_ENABLED=1
```

Redeploy/restart the production deployment if required by the environment-variable change.

At that point AGAYO is open for real ticket sales.

## SMS.RU

SMS is optional for the first production launch. If `SMS_RU_API_ID` is absent, the public login screen automatically offers email login only. Add SMS later without changing the purchase/payment system.
