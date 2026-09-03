# AGAYO service access

The service area is tied to the normal AGAYO ID session. There is no shared `/admin` password.

## First owner
Apply `db/001_init.sql`, then `db/002_admin_access.sql`, set `AGAYO_OWNER_EMAIL` in Vercel, and sign in through `/auth` with that email. That profile becomes the bootstrap OWNER.

## What happens at `/admin`
- no session -> redirect to passwordless AGAYO ID login;
- signed in without an active admin membership -> 404;
- active membership -> only permitted sections are rendered;
- all real admin API mutations must still pass server-side permission checks.

## Team editor
OWNER (or a member with `manage_team`) can assign access by email, phone, or existing AGAYO ID. A role fills a default permission preset; each permission can then be changed independently. Event access can be global or limited to selected event slugs.

A non-owner who can manage team cannot delegate permissions or event scopes that they do not have themselves.
