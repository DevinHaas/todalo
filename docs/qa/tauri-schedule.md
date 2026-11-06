# Upcoming, calendar and schedule views — ticket 16

Recorded 15 October 2026 in the shared browser client against the isolated QA
API (`apps/client/scripts/auth-smoke-server.ts`, memory DB, seeded
`existing@example.test`), Chromium via Playwright, `Europe/Zurich`, real clock.
No production data, secrets or the user's dev API were used.

## What moved

- **Read:** legacy Upcoming loaded `getTasksForUser(userId)` — already in
  `packages/server/src/today.ts` (ticket 3) and served, with explicit ISO date
  DTOs, by `GET /api/v1/today` / native `today`. Upcoming, the month/week calendar
  and Today's schedule read that same query (`taskKeys.today`), so no new endpoint
  or IPC command was added and every task write already refreshes all views.
  Provider events (`getCalendarEventsForUser`) stay in `apps/web` for ticket 20.
- **Rules:** legacy date-fns grouping is ported to `apps/client/src/schedule.ts`
  (local-time day keys, Monday weeks, Sunday month grid, one-year Upcoming
  window, week navigation, 48px hours, 15-minute slots, 30-minute default
  blocks). `schedule.test.ts` compares them with date-fns itself (and legacy
  `navigateViewDate`) in five zones on DST-change, year-end and week-boundary
  instants.
- **Views:** `schedule-views.tsx` (Upcoming list with week strip/scroll-spy,
  month grid, week schedule, Today schedule, Display dialog, layout arrows);
  `schedule-screens.tsx` (Upcoming route, edit dialog and slot composer).
- **Display settings:** legacy in-memory provider semantics (survive
  navigation, not reload): layout List/Calendar, Week/Month, Completed tasks.
  Board is inert (`aria-disabled`, ticket 17) and the toolbar arrows cycle
  List ⇄ Calendar. Sort/Filter rows remain single-option stubs, as in legacy.
- **Edits:** a calendar/schedule task opens `TaskEditor`, saving through
  `taskMutations.update`; all-day rows complete/delete through
  `taskMutations.complete/remove`; a clicked slot opens the composer seeded with
  that day, start and 15-minute end (`dueDateEnd` on create, ticket 12 schema).

## Automated

`bunx vitest run apps/client/src/schedule.test.ts` — 16 tests: date-fns parity
(weeks, month grids, window, navigation, month clamping, labels) in
Europe/Zurich, America/New_York, Australia/Sydney, Pacific/Auckland and UTC;
local-day grouping where the UTC day differs; Upcoming overdue/day/later split;
one section per day across 25 Oct 2026; window extension; block positions and
slot snapping on the 25-hour day; render checks for Upcoming, month grid, Today
schedule and Today's completed/calendar switches.

## Browser walkthrough

| Check | Result |
| --- | --- |
| Upcoming list, month, week and Today schedule vs legacy, 1440×1000 and 390×844 | Matching layout and positions; see side-by-side captures (legacy left, shared client right) |
| No horizontal overflow at either size | `scrollWidth - innerWidth = 0` everywhere |
| Month chip → edit due date 20 → 22 Oct, Save | Chip moves to 22; week view (next week) shows the block on 22 Oct 11:00–12:00 at `top: 528px`; Upcoming list section `2026-10-22` lists it |
| Week slot click Fri 16 Oct at 16:30 → add “Slot task” | Created 16:30–16:45 in that column at `top: 792px` |
| Display state across navigation | Calendar/Week kept when moving Upcoming → Today via sidebar (desktop and mobile) |
| Touch (390×844, `hasTouch`, America/New_York) | Week strip tap, Next week, Today, Display dialog, timed block tap → editor, slot tap → composer |
| Mobile sidebar over the week schedule | Sidebar and backdrop cover the sticky schedule header (`.inset` isolation fix) |

Captures (`docs/qa/tauri-schedule/`): `upcoming-list-*`, `upcoming-month-*`,
`upcoming-week-*`, `today-schedule-*` (desktop/mobile, legacy left),
`sidebar-over-week-mobile.jpg`. Legacy renders come from the temporary route
`docs/qa/tauri-schedule-baseline-page.tsx` (copy to
`apps/web/app/tauri-schedule-baseline/page.tsx`, run `next dev`, open
`/tauri-schedule-baseline?upcoming` or without the query for Today, then delete
the route); its fixture mirrors the QA API's tasks relative to the browser day.
The now-line minute differs between captures.

## Not verified

- iPhone simulator, Mac app and physical devices (no native code changed; the
  views use the existing `today` command).
- Provider events in these views (ticket 20).
- Keyboard commands for week navigation (`upcoming.*`, `calendar.*`; ticket 19).
