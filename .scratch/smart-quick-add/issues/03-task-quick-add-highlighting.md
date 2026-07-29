# 03 — TaskQuickAdd: highlighting + parse-on-submit

**What to build:** In `components/tasks/task-quick-add.tsx`, recognize date/time/recurrence language live as the user types, highlighting matched words inline, using the backdrop-overlay technique (a transparent `<input>` stacked on a styled backdrop `<div>` mirroring the text with highlighted spans — see ADR `0002-quick-add-highlighting-technique`, not `contenteditable`). Clicking a highlighted word rejects it for that compose session (not persisted). On submit, the matched text is stripped from the title and `dueDate`/`startTime`/`recurrence` are passed to `createTask` (which already accepts these fields). No bidirectional sync needed here — `TaskQuickAdd` has no manual date/time/repeat controls.

**Blocked by:** 02 — needs `parseQuickAdd` to drive recognition.

- [x] Typing "call mom tomorrow" highlights "tomorrow" live (debounced) as you type
- [x] Clicking a highlighted word un-highlights it and excludes it from submission for that session
- [x] Submitting creates the task with the matched phrase stripped from the title and `dueDate`/`startTime`/`recurrence` populated accordingly
- [x] Typing "call mom" with no match behaves exactly as today
- [x] Caret position and IME input behave natively (no cursor-jump)
