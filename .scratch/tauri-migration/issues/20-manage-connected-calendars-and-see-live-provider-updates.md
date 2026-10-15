# 20. Manage connected calendars and see live provider updates

Status: in-progress (code-complete; real Google, iPhone/Mac app UI and physical devices pending)
Type: task

**Blocked by:** 16.
    **What it delivers:** Users see their existing calendar events, change account/calendar visibility, resync and disconnect accounts, and receive updates after provider changes.
    **Acceptance:** Migrate settings, event queries, webhooks and streaming as one feature; preserve registered callback URLs and credentials; keep process-local publishers/subscribers together or prove shared fan-out; authenticate native streaming and refetch on resume. Verify visibility, disconnected accounts and legacy calendar behavior end to end.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-16 (ticket 20 agent): Calendar sync, event reads, account management and
the webhook moved to `packages/server` (`calendar-sync.ts`,
`calendar-connections.ts`, `live.ts`); legacy pages, Server Actions and both
calendar routes are wrappers. The API serves `/api/v1/calendar/*`, the preserved
`POST /api/calendar/webhook`, and the live stream `GET /api/v1/stream` in the same
process as its publisher. Natively Rust opens the stream with the Keychain bearer
and forwards parsed frames over a Tauri channel. The client refetches on
connect, change, foreground resume and reconnect. Events render in Today,
Upcoming, the month/week calendar and the daily schedule; the Account screen has
the Calendars section. Evidence: automated route, server, client and Rust tests, plus a
browser walkthrough against stub Google (desktop and 390 px), in
`docs/qa/tauri-calendars.md`. Not verified: real Google consent, watch channels
and push delivery; the stream inside the iOS simulator (the app built and launched,
but simulator text input failed before sign-in); Mac app; physical devices.
