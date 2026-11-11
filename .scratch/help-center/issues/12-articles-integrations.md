# 12. Articles: Integrations

Status: resolved
Type: task

**Blocked by:** 07.

Spec: `.scratch/help-center/spec.md` (Information architecture lists the titles). Follow the writing style guide and the Get started articles from ticket 07.

**What it delivers:** Full drafts of every article in the "Integrations" category, written from the client code and `CONTEXT.md`, with screenshots added to the capture list where needed.  Articles stay `published: false` for the owner's review.

**Acceptance:** Content-module tests pass. Every bold label exists verbatim in the client. Features the spec lists as out of scope are not described. List any mismatch between the app and the spec in Comments.

## Comments

2026-11-11 — Claude (branch `help-center-12-integrations`).

Wrote full drafts of both Integrations articles, all still `published: false`, every step and bold label taken from `apps/client/src` (`calendar-views.tsx`, `calendar-screens.tsx`, `calendar.ts`, `google.tsx`, `toasts.ts`, `errors.ts`) and every sync rule from `packages/server/src/calendar*.ts`, `tasks.ts`, `bulk.ts` and `apps/api/src/calendar-routes.ts`:
- Use Google Calendar with Todalo: connect (Web/Mac platform block for the link flow), choose calendars (eye buttons, **Show events in Today/Upcoming**), multiple Google accounts (answers the in-app link "Find out how to show events from multiple accounts."), where events show (Today, Upcoming, Calendar layouts; read-only, open in Google), the Coach treating visible events as busy time, two-way task sync in each direction (a table for Todalo → Google), Resync, Disconnect and what happens afterwards. The Todoist import is only linked (`/get-started/bring-your-tasks-from-todoist`).
- Troubleshoot Google Calendar: one `##` per symptom, built from the real states and messages: needs consent ("Grant calendar access…"), **Error** vs **Live**, missing events, tasks not reaching Google, Google changes not coming back, the load failure, write-failure toasts, the disconnect that can't succeed, the four link errors, and `GOOGLE_NOT_LINKED` (documented path: **Settings** › **Calendars** › **Link another Google account**, as ticket 07 noted).

Shot added to `SHOTS`: `calendar-settings` (one account card from a synthetic `GET /api/v1/calendar/accounts`; writes aborted), marked in "Use Google Calendar with Todalo". Not captured.

Links to unpublished articles in other categories (publish together or remove first): `/organise-views/plan-your-day-with-the-today-view`, `/organise-views/plan-your-week-with-the-upcoming-view`, `/tasks-capture/schedule-a-date-and-time`, `/coach/review-the-coachs-drafts`, `/apps-account/troubleshoot-sign-in`, `/apps-account/sync-and-working-offline`, `/get-started/bring-your-tasks-from-todoist`.

Where the app and the code, spec or itself disagree, or look wrong:
1. The account card's label is `account.accountId` (`getCalendarAccounts`, DTO field `email`). For Google, Better Auth stores Google's numeric user ID there, not the email, so the card most likely shows a long number. The articles avoid saying "email"; the `calendar-settings` mock shows an email. Fix the label (or the mock) before capturing.
2. Disconnecting the only sign-in account: Better Auth refuses to unlink the last account (`FAILED_TO_UNLINK_LAST_ACCOUNT`, `allowUnlinkingAll` not set). `disconnectAccount` deletes the synced calendars and settings before calling unlink, so the request fails (502 → "Couldn't disconnect the calendar account" / "Something went wrong on todalo's side.") after the calendars were already hidden. Documented as a Warning and a troubleshooting section. Unlink should run first, or the button should be hidden for the last account.
3. Disconnect has no confirmation and no undo.
4. Task push has no on/off switch and no visible failure: every task you add or change with a date goes to the "primary" calendar, failures are only logged (`pushTaskToCalendar` returns null), and tasks dated before connecting are pushed only on their next change. The account it goes to is whatever Better Auth's `getAccessToken` picks without an `accountId` (no explicit order); the inbound side uses the oldest Google account. The articles say "the first Google account you connected".
5. A task with a time but no end time is pushed as an all-day event; only tasks with `dueDateEnd` become timed events.
6. Completing a non-recurring task leaves its event in Google Calendar (completion only re-pushes when a recurring task advances).
7. Inbound changes are dropped if the task's `updatedAt` is newer than the event's `updated`, so any later Todalo edit (even priority) silently discards an earlier Google edit without pushing back. Documented in troubleshooting.
8. All-day pushes use the API server's time zone (`format(task.dueDate, "yyyy-MM-dd")`), so an all-day task can land on the neighbouring day when the server and the user are in different zones. Not documented.
9. After disconnecting the push account, its tasks keep `googleCalendarEventId`; later edits try to update an event in whichever Google account remains and fail silently. Not documented beyond "Todalo no longer updates them".
10. **Error** only means a visible calendar has never synced (`!syncedAt`); later sync failures still show **Live**.
11. `needsConsent` is set when listing calendars fails for any reason (including Google being down), so "Grant calendar access…" can appear when access is fine.
12. With no account, the screen says "Sign in with Google to get started." next to **Link another Google account** (already noted in ticket 07).

Checks: docs tests 100/100, typecheck, lint, production build, preview content validation (40 articles), and in preview mode (port 3006) `/integrations` and both article URLs return 200 (server stopped afterwards).
