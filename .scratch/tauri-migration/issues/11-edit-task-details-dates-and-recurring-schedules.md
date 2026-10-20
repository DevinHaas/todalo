# 11. Edit task details, dates and recurring schedules

Status: in-progress (code-complete; software keyboard in the simulator, physical iPhone, Mac app, legacy web app against a database and real Google Calendar pending)
Type: task

**Blocked by:** 10.
    **What it delivers:** The user edits existing task details and schedules, completes recurring tasks and gets the correct next occurrence.
    **Acceptance:** Preserve the recurrence ADR, timezone/date serialization and calendar-write behavior; reuse authoritative rules from legacy and new transports; test invalid input, recurrence retry deduplication and stale/error states; keep dialogs and task detail synchronized. Labels and organization actions are separate tickets.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented. Evidence: `docs/qa/tauri-task-editing.md`; conventions:
`apps/client/README.md` ("Task edits and recurrence").

Verified:
- The legacy edit moved to `@todalo/server` `updateTask` (the Server Action is a thin
  wrapper; legacy action tests pass). `PATCH /api/v1/tasks/:id` edits title,
  description, priority, deadline, due date/time range and recurrence; strict
  validation, cross-user 404, Origin guard; calendar push on every dialog save as before.
- Recurrence uses the unchanged ADR 0001 rule; tests pin month-end, leap-day, DST and
  server-zone behaviour. Completion is a compare-and-set and records the tap's
  operation ID (`tasks.last_completion_id`, migration 0010): retries advance once,
  concurrent taps advance once, a tap on a date changed elsewhere gets 412 `TASK_CHANGED`.
- Stale edits get 412 unless already applied (so lost edit responses retry safely); the
  dialog keeps the draft and offers "Load current details". Task page and dialog stay in
  sync through the task/Today/project invalidation.
- Browser (desktop, 390×844, ambiguous-write mode) and iOS Simulator (native
  `update_task`/`complete_task`, hardware keyboard) runs.

Not verified: the shell's software-keyboard handling with the software keyboard
(Simulator UI control denied — steps in the QA doc), physical iPhone, Mac app, the
legacy web app against a database, real Google Calendar.

2026-10-20 — Save and add above/below (legacy inline editor `onInsert`): the task
editor saves, closes, and opens a composer on the task page anchored above/below the
task (its project, section and day), with the server's `placement` semantics; each
add re-anchors the next draft below (Enter) or above (Ctrl+Enter) the task just added.
Keys: Shift+Enter / Ctrl+Enter press the two buttons, Cmd/Ctrl+Enter presses Save.
Browser QA: "Below future QA" landed right after "Future fixture task", "Above undated
QA" right before "Undated fixture task".

2026-10-20 — Edit dialog over the list (legacy TaskKeyboardProvider): a row title tap
or Enter opens the editor over Today, Upcoming, Inbox, projects, labels, filters and
search without changing the URL (`/tasks/:id` stays for links and modified clicks).
Previous/Next and Cmd+↑/↓ walk the page's visible rows; Save and add above/below opens
the composer inline next to the row and follows each task just added; closing (Escape,
Cancel, Save) refocuses the row. Stale edits keep the Load current details / Keep my
changes choice. Composer: description behind "Add description", disabled Reminders and
Attachment pills (legacy stubs). Browser QA (isolated QA API, Chromium 1280 and 390×844):
Inbox "Daily standup notes" → Next → Cmd+↑ → Escape (row focused, URL `/inbox`);
Save and add below → "Chain one", "Chain two" landed in order under it; a second tab's
`/tasks/overdue-review` save then this tab's save showed the TASK_CHANGED choice and Keep
my changes saved. 390×844 with a simulated 336 px `--keyboard-inset`: the dialog scrolls
and Save stays reachable. Screenshots: `docs/qa/tauri-task-editing/dialog-*.png`,
`composer-add-description.png`. Not verified: a real iOS software keyboard.
