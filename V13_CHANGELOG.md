# AGAYO v13 FINAL — changelog

v13 is the production-launch release built on top of v12.

## Customer-facing

- Main page always uses the fixed AGAYO brand palette; nearest-event media changes only the hero background image.
- Checkout protects limited promo usage under concurrency and refuses invalid 0 ₽ payment checkout.
- Payment success/cancel/refund states are reconciled against YooKassa.
- Live ticket and AGAYO ID use dynamic PostgreSQL events, including events created in the admin.
- Old demo ticket URLs no longer expose a fake editable ticket.
- Phone login is hidden when SMS.RU is not configured.

## Entrance control

- Replaced experimental `BarcodeDetector` dependency with `@zxing/browser` camera scanning.
- Environment-facing camera requested by default.
- Manual token/link check remains available.
- First valid scan is atomic; repeated/refunded/cancelled tickets do not pass.
- A successful scan updates the user loyalty level from actual visits.

## Admin

- Editable loyalty names and thresholds, including GOLD rename.
- Existing users are recalculated when a loyalty threshold changes.
- Event access selection in the Team section uses the current database-backed event list.
- Production readiness screen reports database schema, AUTH_SECRET, email, Blob, YooKassa, fiscal confirmation, HTTPS URL and owner setup without exposing secrets.
- Removed permission toggles that did not have a real production action.
- Revenue remains hidden from roles without `view_revenue`.

## Payments and database

- New migration: `db/008_production_launch.sql`.
- Pending limited-promo usage reservations prevent oversubscription.
- Order refund timestamp/amount fields added.
- `refund.succeeded` invalidates tickets after authoritative YooKassa verification.
- Explicit `FISCALIZATION_CONFIRMED` launch gate added.

## Dependencies

- `@zxing/browser` 0.2.1
- `@zxing/library` 0.23.0

## v13.1 — гибкая лояльность
- Уровни больше не обязаны зависеть от количества посещений.
- Для каждого уровня можно включить/выключить автоматический переход по посещениям.
- Добавлено свободное поле «Условия уровня».
- В карточке покупателя можно вручную назначить любой уровень независимо от посещений.
- К ручному назначению можно добавить внутренний комментарий команды.
- Ручное назначение не сбрасывается при следующем сканировании QR.
- Кнопка «Вернуть автоматику» снова включает расчёт уровня по посещениям.
- Требуется миграция `db/009_flexible_loyalty.sql`.
