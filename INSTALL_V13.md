# AGAYO v13 FINAL — что сделать после загрузки

## Код

1. Загрузить весь проект v13 в `agayo-family/agayo`.
2. Дождаться зелёного Vercel deployment.
3. Не включать реальные платежи сразу: `PAYMENTS_ENABLED=0`.

## База

Для текущей базы v12 выполнить только:

`db/008_production_launch.sql`

## После миграции

Открыть `/admin` → `Настройки`. Этот экран показывает, какие production-сервисы ещё не готовы, не раскрывая секреты.

## Обязательно до продаж

- Neon/PostgreSQL + migration 008
- `AUTH_SECRET`
- Resend + подтверждённый домен отправителя
- Vercel Blob
- YooKassa Shop ID + Secret Key
- production HTTPS URL
- owner email
- подтверждённая схема фискализации (`FISCALIZATION_CONFIRMED=1` только после реальной проверки)
- YooKassa webhook: `payment.succeeded`, `payment.canceled`, `refund.succeeded`
- полный тест покупки → email → AGAYO ID → QR → повторный QR

Подробно: `docs/PRODUCTION-LAUNCH.md`.
