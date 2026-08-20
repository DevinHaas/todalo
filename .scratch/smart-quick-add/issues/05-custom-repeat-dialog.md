# 05 — Custom Repeat dialog

**What to build:** A Custom Repeat dialog, opened from the Repeat row's "Custom..." option (ticket 04), offering "Based on" (Scheduled date / Completed date), "Every N \<day/week/month/year>", and "Ends" (Never / On date). Confirming sets the task's `recurrence` to the corresponding unified shape, including `basedOn` and `until`.

**Blocked by:** 04 — the dialog is opened from the Repeat row.

- [x] Dialog offers "Based on: Scheduled date / Completed date"
- [x] Dialog offers "Every N \<unit>" for all four units (day/week/month/year)
- [x] Dialog offers "Ends: Never / On date" with a date picker for the latter
- [x] Confirming sets `recurrence` to `{n, unit, basedOn, until}` matching the dialog's inputs
- [x] Reopening the dialog on a task that already has a custom recurrence pre-fills the current values
