# 19. Use and customize keyboard commands

Status: code-complete (Mac app run, physical devices and VoiceOver pending)
Type: task

**Blocked by:** 12, 17, 18.
    **What it delivers:** Existing keyboard navigation/edit commands and account shortcut preferences work in the browser and Mac app, with touch alternatives on iPhone.
    **Acceptance:** Preserve shortcut recording, conflicts, focus/dialog behavior and account settings; verify Mac reserved keys, selection and editable fields; test VoiceOver and prevent inaccessible essential actions. Baseline keyboard accessibility remains required in all earlier tickets.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-20 — Implemented: the legacy keyboard system (registry, dispatcher, conflict/reserved validation, recorder, search, edit, account-preference service) moved to `@todalo/ramble/keyboard*` (legacy `apps/web/lib/keyboard*.ts` re-export it); macOS app-menu keys (Cmd+H, Cmd+Option+H, Cmd+M, Cmd+,, Cmd+`) added to the reserved list for every client. Account shortcuts: shared `packages/server/src/keyboard.ts` (legacy Server Action uses its store), owner-scoped `GET/PUT /api/v1/settings/keyboard` (cookie writes origin-checked; invalid, conflicting or reserved documents 400 and are not written), native `keyboard_preferences`/`update_keyboard_preferences`. Client: one global handler (`keyboard-screens.tsx`) that skips editable fields, open dialogs/menus, IME composition and already-handled keys; capture, Ramble, sidebar, help (?), search/Quick Find, g/o navigation, j/k/arrows and first/last row, Enter/Cmd+E open, E complete, Cmd+Backspace / Shift+Delete delete (focus moves to the next row), X select (starts the touch Select mode), comma focuses the selection toolbar. Every command presses the same visible control a tap uses. Help sheet and Account › Keyboard shortcuts (record, add, remove, restore, per-platform profiles, conflict/reserved errors with fixes, save/cancel/reset) port the legacy UI with spoken key labels.

Evidence: `packages/ramble/src/keyboard.test.ts` (Mac-reserved keys), `packages/server/src/keyboard.test.ts`, `apps/api/src/settings-routes.test.ts` (ownership, 400/401/403), `apps/client/src/keyboard.test.ts` (binding matching, sequences, editable/dialog/IME guards, row movement, transport, view labels); `cargo test`; root `bun run typecheck` and `bun run test` green. Browser QA (isolated QA API, Chromium, Mac profile): j/X/comma on Today, ? help with focus into search and restore on Escape, q typed inside dialogs stays text, q opens Add task without typing into it, o then s opens settings, recording Cmd+H shows the macOS-reserved error and disables Save, recording g shows prefix conflicts, a saved custom key survives reload and works, E completes, Cmd+Backspace deletes and refocuses, Enter opens the task.

Not verified / not wired: Mac app run (Tauri default menu interception), iPhone/iPad hardware keyboards, VoiceOver on device; legacy-only commands without a client feature or with their own dialogs (task date/priority/labels/deadline keys, move/nest, sorting, layout, Upcoming/calendar week keys, add top/bottom, inline editor keys) keep their touch controls but no keys yet — they remain listed in the legacy web settings.
