# Connected calendars and live provider updates (ticket 20)

Date: 2026-10-16. Conventions: `apps/client/README.md` › "Connected calendars and
the live stream". Stubbed providers only; no Google credentials were used.

## What moved

| Legacy (`apps/web`) | Now |
| --- | --- |
| `lib/google-calendar-sync.ts` | `packages/server/src/calendar-sync.ts` (unchanged sync semantics; provider errors logged through `logSafe`, without request config) |
| `lib/calendar-events.ts` | `packages/server/src/calendar-connections.ts` (`getCalendarEventsForUser`, same SQL, echo and visibility filters); legacy path re-exports it |
| `lib/calendar-sync-notify.ts` | `packages/server/src/live.ts` (per-user topics; same process-local ceiling) |
| `settings/page.tsx` account cards, `settings/actions.ts` | `getCalendarAccounts`, `setCalendarVisible`, `setAccountShowEvents`, `resyncAccount`, `disconnectAccount`; the page and Server Actions are wrappers |
| `api/calendar/webhook` | `handleCalendarWebhook`; served by Next (unchanged path) and by the API at the same `/api/calendar/webhook` |
| `api/calendar/stream` (`data: sync`) | Next keeps it for legacy browsers; the shared client uses `GET /api/v1/stream` |

New API (`apps/api/src/calendar-routes.ts`): `GET /api/v1/calendar/events`,
`GET /api/v1/calendar/accounts`, `PATCH /api/v1/calendar/accounts/:id`
(`{ showEvents }`), `PATCH /api/v1/calendar/accounts/:id/calendars`
(`{ googleCalendarId, summary, color, visible }`), `POST …/:id/resync`,
`DELETE …/:id`, `GET /api/v1/stream`, `POST /api/calendar/webhook`.
Errors: 401 `UNAUTHENTICATED`, 403 `FORBIDDEN_ORIGIN`, 400 `INVALID_INPUT`,
404 `NOT_FOUND` (missing or another user's account), 502 `SAVE_FAILED` (provider failure).

Native commands (`src-tauri/src/calendar.rs`): `calendar_events`,
`calendar_accounts`, `show_calendar_account_events`, `set_calendar_visibility`,
`resync_calendar_account`, `disconnect_calendar_account`, `live_stream`,
`stop_live_stream`, `open_calendar_event`.

## Verified

Automated (all stub providers):

- `apps/api/src/calendar-routes.test.ts` (11): per-user event DTOs without echoes,
  account list without tokens, show/hide account and calendar, resync, disconnect
  with only the caller's own auth header (bearer wins over a stray cookie), 404 for
  missing and foreign accounts on every write, body validation (no user ID, hex
  colours only), cookie writes need an allowed Origin, provider failure → 502;
  stream: 401 without a session, cookie or bearer, `ready` first, no CORS header,
  a webhook change reaches every stream of the owner and none of another user,
  spoofed channel/resource/token → 404, the `sync` handshake syncs nothing,
  a client disconnect unsubscribes.
- `packages/server/src/calendar-connections.test.ts` (10): the real server module
  against the relational test boundary and a stubbed `googleapis`: foreign
  accounts untouched, account list merges stored visibility and flags a missing
  grant, one settings row per account, hiding stops the channel and clears the
  cache, showing runs a full sync, resync drops the sync token, disconnect stops
  channels/removes rows then unlinks, webhook verification, incremental sync of a
  cancelled event, 410 → cache cleared for a full resync, logs never contain the
  access token.
- `apps/client/src/calendar.test.ts` (13): DTO allow-list (unsafe colours and
  `javascript:` links dropped), timed vs all-day day keys across zones, HTTP error
  mapping, optimistic toggles with rollback, live updates (refetch on ready and on
  a calendar change, unknown topics ignored, backoff, no retry on
  `UNAUTHENTICATED`, refetch and reconnect on resume, stop), browser
  `EventSource` frames, events first in Today/Upcoming/month/schedule, settings card.
- Rust `calendar::tests` (5): SSE frame parsing across chunk boundaries and CRLF,
  malformed/unknown frames dropped, channel message shape, visibility bodies carry
  only typed fields, only Google Calendar https links open.

Browser (Chromium via Playwright, Vite on :5190 → isolated QA API on :3120,
seed `existing@example.test`):

- Today shows the all-day holiday and the 10:00 standup before tasks; the echo of a
  pushed task and the other user's event are absent (`tauri-calendars/today-desktop.png`, `today-390.png`).
- `POST /api/qa/calendar/provider-change` (stub Google push through the real
  webhook route) made "Provider change 1/2 (Google)" appear without reloading,
  each with exactly one events refetch; the stream stayed open across 15 s idle.
- Upcoming list (`upcoming-desktop.png`), month (`month-desktop.png`) and Today
  schedule (`today-schedule-desktop.png`): events first, all-day in the all-day
  row, timed blocks at their local hour.
- Account › Calendars (`account-calendars-desktop.png`, `account-calendars-390.png`):
  hiding Work removed its events; the account switch removed all; a provider change
  for a hidden calendar is not delivered (no channel). Writes from a second
  `EventSource` on the same account produced `ready` then one `change` per write,
  and the open settings screen updated from the stream. Resync kept events;
  Disconnect removed the card and every event. A foreign account's resync → 404.

## Not verified (pending)

- Real Google: consent screen with Calendar scopes, real `events.watch` channels,
  push delivery to `GOOGLE_WEBHOOK_BASE_URL`, token refresh. All provider calls are
  the moved legacy code, exercised only against stubs.
- The legacy Next app was typechecked, not run; its pages, Server Actions and
  webhook/stream routes are now thin wrappers.
- Production SQL: `getCalendarEventsForUser` is the legacy query moved verbatim;
  the test boundary cannot run its joins, so the filters are covered by the
  memory twin (`apps/api/test-fixtures/calendar-store.ts`) and browser QA only.
- Native: the iOS simulator build (`bun tauri ios build --debug --target
  aarch64-sim --ci`) compiled and launched on iPhone 17 Pro, but simulator text
  input failed before sign-in, so `live_stream`, `open_calendar_event` and the
  settings commands were not exercised in a WebView. They are covered only by Rust
  unit tests (frame parsing, link allow-list, bodies) and `cargo build`. The Mac app
  UI and physical devices were not used.
- Linking a second Google account end to end in the browser (ticket 4 flow,
  unchanged) was not repeated here.

## Configuration the operator must do

- Google Cloud console: OAuth consent screen and client must allow
  `https://www.googleapis.com/auth/calendar.events` and
  `…/auth/calendar.readonly` (already requested by `packages/auth`); keep the
  existing redirect URI `<auth base>/api/auth/callback/google`.
- `GOOGLE_WEBHOOK_BASE_URL` (unchanged name): the public HTTPS origin whose
  `/api/calendar/webhook` reaches the **API process** that serves `/api/v1/stream`.
  Until it is switched, channels keep pointing at the Next app, which still
  verifies and syncs, but only legacy browsers get pushed updates; shared clients
  then refresh on read, focus/resume and reconnect. Channels renew to the new base
  within a day (`ensureCalendarSync`), or immediately on Resync.
  Domain verification for the webhook host is required by Google for push.
- Run one API instance (or add shared pub/sub to `live.ts` first). Proxies in
  front of `/api/v1/stream` must not buffer (`x-accel-buffering: no` is sent).

## Open risks

- Process-local fan-out: a second API instance would silently miss pushes.
- iOS suspends the stream in the background; changes then arrive by the refetch
  on resume, not by push.
- Event links natively depend on Google's `htmlLink` host staying
  `www.google.com` or `calendar.google.com`.
