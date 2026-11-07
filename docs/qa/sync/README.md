# Live sync QA (2026-11-07)

Browser, test user, API on 3011 (no `GOOGLE_WEBHOOK_BASE_URL`: Google polling mode), Vite on 5181, two tabs.

- 01/02: task added in tab A (Inbox) appeared in tab B in ~2.9 s, through one `GET /api/v1/sync?since=…` pull.
- 03/04: ⌘R in tab B: "Syncing…" then "Synced", every read refetched, no page reload.
- 05: both tasks deleted in tab A disappeared from tab B in ~2.3 s (tombstones).

## Real Google check (by hand)

1. Sign in with your Google account, connect Calendar (Settings → Account → Calendars), and open Today once (creates the tasks-only "primary" sync row).
2. Make a task with a time and duration (Schedule drag, or "Write 3pm-4pm today"), and confirm it appears in Google Calendar as a timed event.
3. In Google Calendar: drag the event to 5pm → within ~30 s locally (polling) or seconds with a webhook, the task shows 5–6pm.
4. Resize it to 5–7pm → the task's end time follows. Rename it → the task title follows.
5. Delete the event in Google → the task stays, unscheduled (no date).
6. Edit the task in the app after a Google edit → the app version wins and is pushed back.
7. Production: set `GOOGLE_WEBHOOK_BASE_URL` to the public HTTPS origin routing `/api/calendar/webhook` to the API; the log says "push notifications (webhook)".
