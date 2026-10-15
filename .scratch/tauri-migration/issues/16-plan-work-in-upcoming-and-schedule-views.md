# 16. Plan work in Upcoming and schedule views

Status: in-progress (code-complete; iPhone simulator, Mac app and physical devices pending; provider events are ticket 20)
Type: task

**Blocked by:** 11.
    **What it delivers:** Users navigate Upcoming, task calendar and daily/weekly schedule views using the current design.
    **Acceptance:** Preserve date grouping, task positioning, time ranges and view preferences; verify date boundaries and daylight-saving cases; test desktop/touch controls and task edits flowing back to all views. Provider event overlay is added in ticket 20.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented. Evidence: `docs/qa/tauri-schedule.md` (+ `docs/qa/tauri-schedule/`);
conventions: `apps/client/README.md` ("Upcoming, calendar and schedule").

Verified:
- `/upcoming` (list with week strip, scroll-spy, overdue/day/later groups and per-day
  composers), month and week calendar, and Today's daily schedule, all reading the
  existing Today query (legacy `getTasksForUser`, already in `@todalo/server`).
- Legacy date rules ported and checked against date-fns in five zones across DST,
  week, month and year boundaries; local-day grouping where the UTC day differs.
- Display dialog and toolbar arrows (List/Calendar, Week/Month, Completed tasks) keep
  legacy in-memory semantics across navigation; Board stays inert for ticket 17.
- Browser at 1440×1000 and 390×844 side by side with legacy captures; mouse and touch:
  calendar edit (due date change moves the task in month, week and list), slot click
  creates a 15-minute task at the clicked time, all-day complete/delete rows.

Not verified: native shells (no native change), keyboard week navigation (ticket 19),
provider events (ticket 20).
