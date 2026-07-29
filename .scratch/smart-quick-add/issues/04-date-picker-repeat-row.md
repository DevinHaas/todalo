# 04 — DatePicker Repeat row (presets)

**What to build:** Add a "Repeat" row inside the existing `DatePicker` popover in `components/tasks/task-composer.tsx` (below the calendar, alongside the time inputs), offering "Every day", "Every week on \<weekday>" (weekday implied by the picked date), "Every month on the \<Nth>", "Every N days", and "Custom...". Selecting a preset sets the task's `recurrence` using the unified shape from ticket 01. "Custom..." opens the Custom Repeat dialog (ticket 05) — stub the trigger here if that ticket isn't done yet, but the presets themselves must be fully wired.

`Every weekday (Mon-Fri)` and `Every year` are explicitly excluded as presets (year is Custom-only).

**Blocked by:** 01 — needs the unified recurrence shape to write into.

- [x] Repeat row renders below the calendar in the `DatePicker` popover
- [x] "Every day" sets `{n: 1, unit: "day", basedOn: "scheduled"}`
- [x] "Every week on \<weekday>" sets weekly recurrence anchored to the picked date's weekday
- [x] "Every month on the \<Nth>" sets monthly recurrence anchored to the picked date's day-of-month
- [x] "Every N days" lets the user enter N and sets `{n: N, unit: "day"}`
- [x] "Custom..." opens the Custom Repeat dialog
