# 06 — TaskComposer: highlighting + bidirectional sync

**What to build:** In `components/tasks/task-composer.tsx`, add the same backdrop-overlay title highlighting as ticket 03, plus a last-touch-wins bidirectional sync reducer between the title's parsed matches and the `DatePicker`/`TimeRangeInputs`/Repeat row:

- Editing the title and getting a new/changed match overwrites `dueDate`/`startTime`/`recurrence`.
- Manually changing `DatePicker`/`TimeRangeInputs`/the Repeat row overwrites what parsing set, and suppresses re-parsing that field until the matched phrase changes or disappears from the title.
- A picker/repeat change rewrites the matched inline title text to a canonical form (e.g. picking "tomorrow" via the calendar rewrites "tomorrow" to "21.12").
- Rejecting a highlighted match counts as a manual override too.

**Blocked by:** 03 (reuses the overlay highlighting component), 04 (Repeat row must exist to sync against).

- [x] Typing a new date phrase in the title updates the `DatePicker` pill
- [x] Picking a date via `DatePicker` rewrites the matching title phrase to canonical form (e.g. "tomorrow" → "21.12")
- [x] After a manual `DatePicker` change, re-typing over the same phrase in the title does not silently overwrite the manual choice until the phrase actually changes
- [x] Typing "every day"/"every week"/"every month"/"every N days" sets the Repeat row's selection to match
- [x] Manually setting the Repeat row overrides a previously-typed recurrence phrase
- [x] Rejecting a highlighted match suppresses re-parsing of that field for the rest of the session
