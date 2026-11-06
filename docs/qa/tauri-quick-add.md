# Smart quick add and the date-recognition setting — ticket 12 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts`, port 3121, `QA_CLIENT_ORIGIN=http://127.0.0.1:5321`,
Vite on 127.0.0.1:5321) run from a clean worktree of the ticket 12 commit. No production
data; the user's port-3001 API was not touched. Screenshots: [`tauri-quick-add/`](tauri-quick-add/).

## What was exercised

| Capture | Client | Result |
| --- | --- | --- |
| `highlight-desktop.jpg` | Chromium 800 × 600 | Typing "Call mom tomorrow at 4pm " in Today's composer highlights "tomorrow" and "at 4pm" in the backdrop (ADR 0002) and the date pill reads "Tomorrow 16:00". |
| `rejected-time.png` | Chromium | Clicking the "at 4pm" highlight rejects it: the highlight goes, the pill drops the time. |
| `manual-date-rewrite.png` | Chromium | Date pill › Next week rewrites "tomorrow" to the canonical "19.10" and the pill reads "19 Oct" (legacy last-touch-wins). Repeat › "Every week on Monday" then Enter in the title → `POST /api/v1/tasks` 201: title "Call mom at 4pm", due 19 Oct local midnight, weekly recurrence. |
| — | Chromium | Account › Smart date recognition off → full page reload: still off → sign out and sign in again: still off (server-side per account). Composer with "Call mom tomorrow at 4pm " shows no highlight and the task saved with the title unchanged, due today. |
| `setting-save-failed.jpg` | Chromium, `QA_SETTINGS_SAVE_FAILS=1` | Unticking the setting flips it at once (disabled while saving); the save fails twice more on retry, the switch rolls back to on and shows "…could not be saved… The setting was not changed." |
| `highlight-mobile.jpg` | Chromium 390 × 844 | Long title with "every month friday 9am for 1h": the input scrolls and the backdrop follows (`scrollLeft` equal), page `scrollWidth` 390; pill "Tomorrow 09:00-10:00". |
| `date-panel-mobile.jpg`, `custom-repeat-mobile.jpg` | Chromium 390 × 844 (taps) | Date pill panel (quick dates, date, time range, Repeat) and the legacy Custom repeat dialog. Completed date, every 2 weeks, ends 31 Dec → title phrase rewritten to "every 2 weeks"; tapping Add task saved `recurrence { n: 2, unit: "week", basedOn: "completed", until: 31 Dec }`, `dueDateEnd` 10:00, title "Pay the very long electricity bill". |

## Automated coverage

- `packages/ramble/src/quick-add-sync.test.ts` (moved from `apps/web/lib`): the legacy
  last-touch-wins rules, plus `highlightSegments` (the word being typed stays plain).
- `apps/client/src/quick-add.test.ts`: stripped title, start/end/repeat as ISO values in
  the viewer's zone, setting off, rejected phrases, a manual date kept for an unchanged
  phrase, seeded dates, legacy quick-date options and repeat presets.
- `apps/client/src/composer.test.ts`: composer rendering (backdrop, date pill, slot
  seeds from ticket 16), the custom repeat dialog, the settings transport (allow-listed
  field, error codes), optimistic flip and rollback, the Account setting states.
- `packages/server/src/settings.test.ts`: default on without a row, per-account upsert.
- `apps/api/src/settings-routes.test.ts`: `GET`/`PATCH /api/v1/settings` session-only
  user, strict body (no `userId`), malformed JSON, 401, cookie writes need an allowed
  Origin (403), bearer ignores cookies, `no-store`.
- `apps/api/src/task-routes.test.ts`: create with `dueDateEnd` and `recurrence`;
  end time without a due date, bad units, `n` 0 and extra recurrence fields are 400.
- `src-tauri/src/settings.rs`, `src-tauri/src/writes.rs`: settings and create bodies
  rebuilt from typed fields.

## Not verified

- **iOS software keyboard** with the composer: needs Simulator › I/O › Keyboard, and
  Simulator UI control was denied. No iOS or Mac build was made for this ticket; the
  native commands are covered by Rust tests only.
- Physical devices; the legacy web app and `user_settings` against a real database.
