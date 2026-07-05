# Habito

A simple, self-hostable, open-source Todoist alternative. Calendar / Board / List views, due dates, recurring tasks (daily / weekly / monthly / every N days), and one-way sync of due dates to Google Calendar.

## Quick start (Docker Compose)

1. **Provision a Neon Postgres project** at [neon.tech](https://neon.tech) (or via `neonctl`) and copy its connection string.
2. **Create a Google OAuth client** in [Google Cloud Console](https://console.cloud.google.com):
   - Enable the **Google Calendar API**.
   - OAuth consent screen: add yourself (and any other users) as a test user, unless you verify the app.
   - Credentials → OAuth client ID → Web application.
   - Authorized redirect URI: `http://<your-host>/api/auth/callback/google` (use `http://localhost:3000/...` for local use).
   - Copy the resulting Client ID and Client Secret.
3. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — your Neon connection string
   - `BETTER_AUTH_SECRET` — any random string (e.g. `openssl rand -hex 32`)
   - `BETTER_AUTH_URL` — the public URL the app is served at
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — from step 2
4. `docker compose up --build`

The container runs pending Drizzle migrations automatically on startup, then serves the app on port 3000.

## Local development

```bash
bun install
bun run db:migrate   # apply schema to your Neon project
bun run dev
```

## Architecture notes

- **Views**: Calendar/Board/List are three thin pages that all call the same `getTasksForUser` query (`lib/tasks.ts`) and group the result in memory — there's no generic view-renderer abstraction.
- **Recurrence**: a 4-variant tagged union (`lib/recurrence.ts`) — daily/weekly/monthly/every-N-days — not a full RRULE engine. Completing a recurring task rolls its `dueDate` forward on the same row.
- **Google Calendar sync**: one-way push only (`lib/google-calendar.ts`). App due dates are pushed to the signed-in user's primary calendar as all-day events on task create/update/delete. Two-way sync (reading edits made in Google Calendar back into the app) is not implemented — a natural next contribution.
- **Auth**: Better Auth with a single Google provider, requesting both login scopes and `calendar.events` in one grant — no separate OAuth connection for Calendar access.
