# Edit task details, dates and recurring schedules — ticket 11 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts`, port 3071, `QA_CLIENT_ORIGIN=http://localhost:5271`,
Vite on 5271; later restarted with `QA_AMBIGUOUS_WRITES=1`). No production data; the
user's port-3001 API was not touched. The QA API now runs the same pure rules as the
server (`packages/server/src/task-rules.ts`) and seeds a daily recurring fixture
(`/tasks/daily-standup`). Screenshots: [`tauri-task-editing/`](tauri-task-editing/).

## What was exercised

| Capture | Client | Result |
| --- | --- | --- |
| — | Chromium 800 × 600 | Completing "Daily standup notes" (daily, due today 09:30) removed it from Today (count 3 → 2); the server task moved to 16 Oct 09:30, still open, `recurrence` in the DTO. |
| — | Chromium (API from the page) | Same tap ID sent twice → both 200, one advance (17 Oct); a new tap ID with the old occurrence → `412 TASK_CHANGED`, task unchanged. |
| `editor-desktop.jpg` | Chromium 800 × 600 | Opening `/tasks/shared-screen` opens the edit dialog (legacy behaviour) seeded with title, priority, deadline, due date 15 Oct, start 14:30. |
| — | Chromium | Renamed, priority 2, end 15:30, Repeat Weekly → saved; page shows "Priority 2 · Due 15 Oct 14:30 · Every week · Deadline 18 Oct 2026"; server kept `labelIds: ["design"]`, `dueDateEnd` 15:30 local. |
| `stale-edit-desktop.jpg` | Chromium | Draft "My local rename" open while another client PATCHed the task (title, due 20 Oct). Save → "This task changed on another device…" with the draft intact; "Load current details" reloaded the other device's values; a further save succeeded. |
| `editor-mobile.jpg` | Chromium 390 × 844 | Dialog fits the phone width; `scrollWidth` 390. |
| — | Chromium 390 × 844, `QA_AMBIGUOUS_WRITES=1` | Edit: `PATCH` → 500 (applied, answer dropped) then → 200 (recognised as the same values, not 412). Completion: `POST …/complete` → 500 then → 200, the task advanced once (15 → 16 Oct). |
| — | Chromium | Cross-user `PATCH /api/v1/tasks/other-private` → `404 NOT_FOUND`. |
| `ios-saved-daily.png`, `ios-completed-next-day.png`, `ios-editor.png` | iOS Simulator iPhone 17 Pro (iOS 26.0.1), debug `aarch64-sim`, `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3071` | Fake-Google sign-in. Created a task, opened it (dialog opened), set Repeat Daily through the native picker and saved over `update_task`; page showed "Every day". "Complete task" over `complete_task` (with tap ID) moved it to 16 Oct. WebKit date inputs overflowed the dialog and the Delete button was clipped; fixed (stacked Clear buttons, `appearance: none`, wrapping actions) and re-checked in `ios-editor.png`. |

## Software keyboard (gate finding 2)

Implemented in the shared shell (`apps/client/src/software-keyboard.ts`, `styles.css`):
`--keyboard-inset` from `visualViewport` pads the page and lifts fixed dialogs above the
keyboard, the focused field is scrolled into view when the keyboard opens, an opaque
safe-area strip stops scrolled content running under the status bar, the phone toolbar is
sticky, and forms that unmount while focused (composer, task editor, project rename) blur
first via `releaseFocus` to clear the autocorrect bubble.

**Not verified with the software keyboard.** Disconnecting the simulator's hardware
keyboard needs the Simulator app's I/O menu; desktop control of Simulator was denied. A
`DevicePreferences` `ConnectHardwareKeyboard = false` import plus a device reboot did not
change the running Simulator app, and the preference was restored from its backup
afterwards. To verify: Simulator › I/O › Keyboard › untick "Connect Hardware Keyboard",
open Today › Add task, the task editor and a project rename, and check that the field
stays above the keyboard, the toolbar stays below the status bar, and no autocorrect
bubble remains after Cancel/Save. Also required on a physical iPhone (gate checklist).

## Automated coverage

- `packages/server/src/task-rules.test.ts`: legacy recurrence (scheduled vs completed
  basis, undated, inclusive `until`, jsonb string `until`), month-end and leap-day
  clamping, DST in Europe/Berlin and America/New_York, the UTC-server reading of a
  local-midnight due date, replay/stale/legacy-no-op decisions, edit conflict rules.
- `packages/server/src/tasks.test.ts`: retried tap recognised after the advance; stale
  tap refused without writing; two concurrent completions advance once (fails if the
  compare-and-set is removed); final occurrence completes without a calendar write;
  edit saves details and pushes the due date to the calendar, title-only edits do not;
  retried edit accepted, stale edit refused; foreign/missing tasks are missing.
- `apps/api/src/task-routes.test.ts`: PATCH ownership, strict validation (blank title,
  priority, bad dates, missing version, end without date, bad recurrence, extra
  fields, malformed JSON), 412 for stale edits and taps, shared 404, Origin/401 guard,
  DTO allow-list.
- `apps/client/src/tasks.test.ts`: transport bodies and 412 mapping, tap ID reused on
  retry, stale tap rolled back without retry, edit retried with the same body and
  invalidating task/Today/project keys, no retry for stale or missing edits, editor
  rendering (custom repeat kept), local-zone date helpers.
- `src-tauri/src/writes.rs`: completion and edit bodies rebuilt from typed fields.
- Legacy `metadata-actions`/`organization-actions` tests pass through the new wrapper.

## Not verified

Software keyboard (above); the legacy web app against a real database; real Google
Calendar writes (stubbed in tests); the Mac app (UI control denied); physical iPhone.
Applying migration `0010_task_completion_operation` to a real database.
