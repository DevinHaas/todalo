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
