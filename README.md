# NotioX Front Desk

Owner console for coaches, ADHD trainers, mental health doctors, UGC creators, and others.

**This is not the NotioX client/student app.** Clients remain on [notiolive.com](https://www.notiolive.com) and enter promo/referral codes there. Front Desk owners generate those codes.

## Stack

- TanStack Start + React 19
- Tailwind CSS v4
- Supabase (Auth + Postgres + RLS)
- Resend (email)
- Stripe (revenue — placeholder until keys exist)

## Local pipeline

1. **localhost** (this step) → smoke test
2. GitHub → [uday3756/notiox-frontdesk](https://github.com/uday3756/notiox-frontdesk) (push requires `GH_TOKEN` on Cloud Agent)
3. Vercel **PREPROD** — import repo; see `docs/vercel-new-project.md` in the agent store
4. Vercel **PROD** (after user sign-off only)

Do not deploy prod from this scaffold session.

## Setup

```bash
cp .env.example .env
# fill real secrets when available — never commit .env
npm install
npm run dev
```

App defaults to **http://localhost:3000**.

Without Supabase/Resend/Stripe keys the UI runs in **demo mode** with in-memory sample data.

## Migrations

Apply `supabase/migrations/20251101000000_init_frontdesk.sql` in your Supabase project (SQL editor or CLI with **database password**, not the service-role JWT).

Tables: `owners`, `owner_codes`, `owner_clients`, `owner_tasks`, `owner_task_assignments`, `owner_email_campaigns` — all RLS owner-scoped.

> Note: Front Desk email table is `owner_email_campaigns` so it does not collide with an existing NotioX `email_campaigns` table on a shared project.

```bash
# optional local apply when you have the DB password:
SUPABASE_DB_PASSWORD='...' node scripts/apply-migration.mjs
```


## Auth

- Email/password via Supabase Auth only (for now)
- Google OAuth is deferred — do not enable until explicitly requested
- `/auth/callback` remains for email confirmation / magic-link redirects
