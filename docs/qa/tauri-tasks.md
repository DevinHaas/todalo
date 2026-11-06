# Create, complete and delete a basic task — ticket 5 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts` on port 3011 with
`QA_CLIENT_ORIGIN=http://localhost:5175`, Vite on 5175; ports 3009/5173 were in
use by another agent). No production data; the user's port-3001 API untouched.
Screenshots are in `docs/qa/tauri-tasks/`.

## What was exercised

| Capture | Client | Result |
| --- | --- | --- |
| `composer-desktop.png` | Chromium 1440 × 1000 | Today "Add task" opens the composer (title, description, `Today` destination, Cancel/Add task). Enter saved "Buy stamps": row appeared, `3 tasks` and sidebar badge `3`, composer cleared and kept focus. |
| — | Chromium 1440 × 1000 | Completion checkbox on "Buy stamps" and row delete on the overdue fixture: rows left at once, count and badge `1`; `/api/v1/today` then showed "Buy stamps" `done` and the overdue task gone. |
| `quick-add-desktop.png` | Chromium 1440 × 1000 | Sidebar Add task opens the Inbox quick add; "Inbox idea" saved undated (not in Today) with a "View task" link. |
| `failure-retained-desktop.png` | Chromium 1440 × 1000 | QA API stopped, "Call the plumber" submitted: three attempts (two retries), then "Your changes could not be saved. Try again."; the draft stayed in the composer and the last Today list stayed on screen with a load error. |
| — | Chromium 390 × 844 | `QA_AMBIGUOUS_WRITES=1` (write applied, response replaced by 500): create sent `POST /api/v1/tasks` → 500 then → 200 (replay, same operation ID), one "Retry-safe task" on the server; completion → 500 then → 200, task `done` once. `scrollWidth` 390. |
| `composer-mobile.png`, `detail-mobile.png` | Chromium 390 × 844 | Composer at phone width; task detail Complete/Delete. Delete returned to `/today`; `GET /api/v1/tasks/shared-screen` → 404. |
| — | Chromium | Cross-user: `DELETE` and `POST …/complete` on `/tasks/other-private` → identical `404 NOT_FOUND`. |
| `ios-composer.png`, `ios-created.png`, `ios-completed.png` | iOS Simulator, iPhone 17 Pro (iOS 26), debug `aarch64-sim`, `TAURI_TODALO_API_BASE_URL=http://127.0.0.1:3011` | Signed in through the fake Google provider. Native `create_task` (first answer 500, retried to one task), `complete_task` and `delete_task` IPC commands through the Keychain bearer. Delete × is visible without hover; focusing the title did not zoom the page. |

## Automated coverage

- `packages/server/src/tasks.test.ts`: replayed create returns the original task with
  one calendar push; another user's operation ID is refused without change; legacy
  validation; completion replay keeps `completedAt`; a recurring completion replayed
  with the same occurrence advances once; foreign complete/delete are missing.
- `apps/api/src/task-routes.test.ts`: 201/200 replay, `userId` in the body ignored,
  409 conflict, 400 `INVALID_INPUT` (incl. malformed JSON), shared 404 for foreign
  and missing IDs, cookie writes need an allowed `Origin` (403), no-store.
- `apps/client/src/tasks.test.ts`: write transport paths/bodies/errors, UUID
  operation IDs, a lost create response retried with the same ID, no retry on
  rejection, optimistic completion/count with rollback, delete treated as done after
  a retry, write controls and composer rendering.
- `src-tauri/src/writes.rs`: create bodies carry only task fields and a UUID.
- Legacy `metadata-actions`/`organization-actions` tests pass through the new wrappers.
- Root `bun run test` (383), `typecheck`, `build`, `cargo fmt --check`, `cargo test --locked` passed.
  `bun run lint` shows only the 3 known `apps/web` errors.

## Not verified

- The legacy web app was not run against a database here; the shared operations
  and the Server Action wrappers are covered by tests only.
- Google Calendar side effects were not exercised against Google (tests use a
  provider stub); the calendar code moved unchanged.
- Software keyboard: the simulator had a hardware keyboard attached, so only the
  input accessory bar appeared. With a focused field, the first injected tap on
  Add task sometimes only blurred the field; a physical-device check is needed to
  tell this from simulator tap injection.
- Physical iPhone and the Mac app; the iOS build included other agents'
  uncommitted work in the shared worktree.
