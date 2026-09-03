# AGAYO backend — setup

This stage adds the real server contract. It does not include production secrets.

1. Create a PostgreSQL database and run `db/001_init.sql` once.
2. Add `DATABASE_URL` and a long random `AUTH_SECRET` in Vercel Environment Variables.
3. Connect an email provider and fill `EMAIL_PROVIDER_API_KEY` + `EMAIL_FROM`.
4. Add YooKassa Shop ID and Secret Key.
5. In YooKassa create a webhook pointing to `/api/payments/yookassa/webhook` for successful payments.
6. Set `NEXT_PUBLIC_SITE_URL` to the production domain.

Flow:
checkout → server validates event price → user/profile upsert by email → pending order → YooKassa redirect → YooKassa webhook → server verifies payment directly with YooKassa → order paid → separate ticket + secure QR token for each quantity → ticket stored in profile data → ticket email sent.

Authentication:
email → one-time 6-digit code (10 minutes, rate-limited) → auto-create user if absent → 30-day HttpOnly session cookie. No passwords are stored.

Phone login is represented in the API/UI but intentionally returns "provider not connected" until an SMS service is selected. Telegram ticket delivery remains a later adapter.

## Служебная зона и AGAYO ID

1. После `db/001_init.sql` применить `db/002_admin_access.sql`.
2. В Vercel добавить `AGAYO_OWNER_EMAIL` — email основного владельца AGAYO. Этот аккаунт получает bootstrap-роль OWNER после обычного входа по одноразовому коду.
3. `/admin` защищён сервером: без сессии пользователь перенаправляется на `/auth`, а авторизованный пользователь без служебной роли получает 404.
4. В разделе «Команда» OWNER может найти/создать профиль по email или телефону, либо найти существующий профиль по AGAYO ID, выбрать роль, отметить конкретные функции галочками и ограничить доступ мероприятиями.
5. Права хранятся в PostgreSQL и должны проверяться каждым служебным API через `requireAdminPermission(...)`. Ограничение конкретным событием проверяется тем же helper через `eventSlug`.
6. `admin_audit_log` фиксирует выдачу, изменение и отзыв служебного доступа.

Роль — это только удобный пресет галочек. Реальное разрешение на действие определяется сохранённым набором permissions. OWNER не может быть снят с собственного bootstrap-доступа через интерфейс.
