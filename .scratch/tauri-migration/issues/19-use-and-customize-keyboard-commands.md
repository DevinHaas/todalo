# 19. Use and customize keyboard commands

Status: code-complete (all code scope wired; only Mac app run, physical-device keyboards and VoiceOver checks pending)
Type: task

**Blocked by:** 12, 17, 18.
    **What it delivers:** Existing keyboard navigation/edit commands and account shortcut preferences work in the browser and Mac app, with touch alternatives on iPhone.
    **Acceptance:** Preserve shortcut recording, conflicts, focus/dialog behavior and account settings; verify Mac reserved keys, selection and editable fields; test VoiceOver and prevent inaccessible essential actions. Baseline keyboard accessibility remains required in all earlier tickets.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-20 — Implemented: the legacy keyboard system (registry, dispatcher, conflict/reserved validation, recorder, search, edit, account-preference service) moved to `@todalo/ramble/keyboard*` (legacy `apps/web/lib/keyboard*.ts` re-export it); macOS app-menu keys (Cmd+H, Cmd+Option+H, Cmd+M, Cmd+,, Cmd+`) added to the reserved list for every client. Account shortcuts: shared `packages/server/src/keyboard.ts` (legacy Server Action uses its store), owner-scoped `GET/PUT /api/v1/settings/keyboard` (cookie writes origin-checked; invalid, conflicting or reserved documents 400 and are not written), native `keyboard_preferences`/`update_keyboard_preferences`. Client: one global handler (`keyboard-screens.tsx`) that skips editable fields, open dialogs/menus, IME composition and already-handled keys; capture, Ramble, sidebar, help (?), search/Quick Find, g/o navigation, j/k/arrows and first/last row, Enter/Cmd+E open, E complete, Cmd+Backspace / Shift+Delete delete (focus moves to the next row), X select (starts the touch Select mode), comma focuses the selection toolbar. Every command presses the same visible control a tap uses. Help sheet and Account › Keyboard shortcuts (record, add, remove, restore, per-platform profiles, conflict/reserved errors with fixes, save/cancel/reset) port the legacy UI with spoken key labels.

Evidence: `packages/ramble/src/keyboard.test.ts` (Mac-reserved keys), `packages/server/src/keyboard.test.ts`, `apps/api/src/settings-routes.test.ts` (ownership, 400/401/403), `apps/client/src/keyboard.test.ts` (binding matching, sequences, editable/dialog/IME guards, row movement, transport, view labels); `cargo test`; root `bun run typecheck` and `bun run test` green. Browser QA (isolated QA API, Chromium, Mac profile): j/X/comma on Today, ? help with focus into search and restore on Escape, q typed inside dialogs stays text, q opens Add task without typing into it, o then s opens settings, recording Cmd+H shows the macOS-reserved error and disables Save, recording g shows prefix conflicts, a saved custom key survives reload and works, E completes, Cmd+Backspace deletes and refocuses, Enter opens the task.

Not verified / not wired: Mac app run (Tauri default menu interception), iPhone/iPad hardware keyboards, VoiceOver on device; legacy-only commands without a client feature or with their own dialogs (task date/priority/labels/deadline keys, move/nest, sorting, layout, Upcoming/calendar week keys, add top/bottom, inline editor keys) keep their touch controls but no keys yet — they remain listed in the legacy web settings.

2026-10-20 — Wired (each presses the visible control a tap uses): `task.add-bottom` (A:
the focused section's, else the page's, Add task), `task.add-top` (Shift+A: same, then the
position toggle to top), `editor.submit-below` (Enter in a composer title: Add task, next
draft below), `editor.save-above` (Ctrl+Enter: composer Add task with the next draft
above / editor "Save and add above"), `editor.save-below` (Shift+Enter: "Save and add
below"), `editor.save` (Cmd/Ctrl+Enter: Save), `quick-add.description` (ArrowDown),
`quick-add.actions` (Shift+ArrowDown: Additional actions, focus Priority),
`quick-add.deadline` ({: Additional actions, focus Deadline). Composer/editor commands are
allowed in fields and dialogs and decline outside their form, so Enter elsewhere keeps its
own meaning (`apps/client/src/keyboard.test.ts`). Browser QA (Chromium, Mac profile): all
of the above on Today, a project and task pages.

Still not wired: row-level date/priority/labels/deadline keys (t, y, 1–4, l, d, Shift+T/D),
`editor.previous/next` (the client editor opens on the task page, not over a list),
move/nest, sorting, layout and Upcoming/calendar week keys.

2026-10-20 — Remaining commands wired; ticket 19 code scope is complete.
- Project sort `d`/`n`/`p` choose the visible "Project sort" select (`d` yields to a focused
  row, whose deadline wins, as legacy); `s` Add section, `w` Project menu press their buttons.
- `Shift+V` presses "Next layout"; focus returns to the list when the old layout took it.
- Upcoming (`Home` / Mac `Option+Shift+Y`, `Shift+←/→`) and Calendar (`t`, `Shift+←/→`) press
  the Previous week / Today / Next week buttons of the shown view.
- Pickers `t` (date), `y`, `l`, `d`: with tasks selected, the selection toolbar's Priority /
  Labels / Deadline (legacy targets); otherwise the focused task opens with its editor (as a
  title tap does) focused on Due date / Priority / Labels / Deadline — the client has no
  per-row date picker.
- `v` Move: the toolbar's Move; with nothing selected the focused row is selected first
  (Select, its checkbox), the dialog's field takes focus and selection ends when it closes.
- Immediate writes `1`–`4`, `Shift+T`, `Shift+D` (selection, else focused row) and
  `Ctrl+]`/`Ctrl+[` nest/unnest (under the row above or its parent; Manual sort only) call the
  same client mutations as the toolbar and the task page's Nest/Unnest buttons rather than
  pressing a control: those controls live on another page/dialog, and legacy wrote in place.
  Failures show a `role="alert"` notice.
- `editor.previous/next` (`Cmd/Ctrl+↑/↓` in the editor): the client editor lives on the task
  page, so the closest equivalent is used — the list the task was opened from (title tap or
  Enter) is remembered; the key presses Save and, once saved, opens the adjacent task's page,
  whose editor opens on arrival. Without a remembered neighbour the key keeps its field meaning.
Evidence: `apps/client/src/keyboard.test.ts` (every new binding, `d`/`t`/`Shift+arrows`
fall-through when a handler declines, `Cmd+↑` editor vs first row). Browser QA (isolated QA
API, Chromium, Mac profile): sort keys, `1`/`4` priority pill, `Ctrl+]`/`Ctrl+[` nest and
unnest plus both refusal notices, `v` with/without selection (Escape ends auto-selection and
refocuses the row), `x` then `l` toolbar Labels, `Shift+T` clears a date (row leaves Today),
`y`/`t` open the editor on Priority/Due date, `Cmd+↑` saves and opens the previous Today task,
Upcoming and month-calendar week keys, `Shift+V` cycling List/Board/Calendar.

Pending only: Mac app run (Tauri menu interception), iPhone/iPad hardware keyboards, VoiceOver
on device.

2026-10-20 — Leftovers closed and a final parity pass with legacy `apps/web`.
- Selection on every legacy ViewSwitcher list: Upcoming, label, filter, search and the new Inbox
  now have the Select button, the bulk toolbar and row checkboxes (list layout, as on Today), so
  `x`, `,`, `y`/`l`/`d`/`t` and `v` act on a selection there too. Label, filter, Inbox and search
  also get the Board and week Calendar layouts the toolbar arrows switch to (legacy ViewSwitcher).
- New keys: `.` opens the legacy "Task actions" dialog (Edit, Choose date, Clear date, Complete,
  Delete; each runs the row's own control/key, Clear date on that task only; Escape refocuses the
  row); `Cmd/Ctrl+Shift+C` copies the row's link ("Task link copied."; native passes WebKit a
  ClipboardItem so the write starts inside the key press); `Shift+G` opens the task's project
  (else the Inbox) with `#task-<id>` and focuses its row; `Shift+E` folds the row's sub-tasks;
  `Cmd/Ctrl+Option+0` folds every sub-task and project section (Manual sort only); `g i` Inbox,
  `g /` Navigate sections (sections-only Quick Find). Legacy had no visible control for the
  menu, copy key, reveal or folding either; folding is page state cleared on navigation.
- Dialog focus: the Move, Nest and bulk Priority/Labels/Deadline dialogs take focus when opened by
  a tap (the field, else the dialog), so Escape and Tab work on the tap path.
- Parity fixes: `/inbox` route and sidebar link (project deletion now lands there, as legacy);
  `/settings` redirects to Account; project rows complete and delete; the project list honours
  Display › Completed tasks; a project's Calendar slot adds the task to that project; sidebar
  Help & resources opens the shortcut sheet; the edit dialog has Previous/Next when opened from a
  list (`Cmd+↑/↓` press them); task page "Open task collection"; Board/Calendar editors show
  labels and Task link/Copy link; app-wide shortcut sync warning with "Shortcut settings".
Evidence: `apps/client/src/keyboard.test.ts` (new bindings, sub-task folding, Task actions,
dialog focus), `bulk.test.ts` (collection selection and layouts, project row writes and
completed tasks), `search.test.ts` (Previous/Next, Open task collection, copy link). Root
`bun run typecheck` and `bun run test` (74 files, 663 tests) green. Browser QA (isolated QA API,
Chromium): Inbox list and `g i`; `/settings` → `/account`; Upcoming `x` + toolbar; tapping Move
and Labels focuses the dialog and Escape closes it; project rows complete/delete; `Ctrl+]` then
`Shift+E` and `Cmd+Option+0` fold/unfold (drag handles hide with their rows); `.` menu, Escape
refocus, menu Complete; `Cmd+Shift+C` clipboard holds `/tasks/shared-screen`; `Shift+G` from
Today to the project and to the Inbox with the row focused; `g /`; Help & resources; label page
Select and Board/Calendar; search `x` then `l`; editor Next opens the next Today task.

Still not wired: `task.paste-file` as a custom binding (default `Cmd/Ctrl+V` native paste works);
opening a `#task-<id>` link directly does not reveal the row (only the key does); copy link in the
Mac app is unverified.
