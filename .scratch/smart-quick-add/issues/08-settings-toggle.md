# 08 — Settings toggle: smart date recognition

**What to build:** A new `user_settings` table (one row per user, keyed by `userId`, holding `smartDateRecognitionEnabled: boolean` default `true`, designed to be extended later but not built further now). Add a new General section to `app/(app)/settings/page.tsx` (which currently only has Calendars) with a single toggle, wired via a server action. When disabled, `TaskQuickAdd` and `TaskComposer` stop recognizing/highlighting date language entirely — plain text input, no parsing.

**Blocked by:** 03 (TaskQuickAdd parsing), 06 (TaskComposer parsing) — the toggle needs both parsing surfaces to gate.

- [x] `user_settings` table exists with `userId`, `smartDateRecognitionEnabled` (default `true`)
- [x] Settings page shows a new General section with the toggle, above or alongside Calendars
- [x] Toggling off disables highlighting/parsing in both `TaskQuickAdd` and `TaskComposer`
- [x] Toggling back on re-enables it without a page reload
- [x] Setting persists across sessions
