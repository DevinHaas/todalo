# 07 — Recurrence completion wiring: basedOn + until

**What to build:** Wire `basedOn` and `until` into the actual next-occurrence computation used at task completion, in `app/(app)/tasks/actions.ts`. Currently the completion action calls `getNextDueDate(base, task.recurrence)` with `base = task.dueDate ?? new Date()`. When `recurrence.basedOn === "completed"`, `base` must be `completedAt` instead of `dueDate`. When `recurrence.until` has passed, no further occurrence is generated (the task is completed without being rescheduled).

**Blocked by:** 01 (unified shape), 05 (Custom Repeat dialog is how a user actually sets `basedOn`/`until` to verify this end-to-end).

- [x] Completing a task with `basedOn: "scheduled"` behaves exactly as today (advances from `dueDate`)
- [x] Completing a task with `basedOn: "completed"` advances from the actual completion timestamp, not `dueDate`
- [x] Completing a task whose computed next occurrence would fall after `until` does not create a new occurrence
- [x] Completing a task with `until` in the future still recurs normally
