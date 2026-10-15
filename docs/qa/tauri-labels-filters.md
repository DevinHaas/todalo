# Labels and saved filters — ticket 14 evidence

Shared client against the isolated QA API (`apps/client/scripts/auth-smoke-server.ts`,
memory store, port 3041, Vite on 5191 with `QA_CLIENT_ORIGIN`), signed in as the
seeded `existing@example.test`. Fixtures: labels `Design`, `Urgent` and another
user's label; saved filters stored in legacy shapes — `Design work` (cleared
selects as `null`), `Overdue anything`, `Work (old row)` (`{ projectId }` only, no
status/due defaults), `Old design label` (names a label deleted since) and another
user's filter.

## What was exercised (browser, desktop and 390×844)

- `/filters` renders the legacy directory (labels with color dots, Edit/Delete per
  row, create form; saved filters with the five condition selects); the sidebar
  entry "Filters & Labels" is live and highlighted on `/filters` and `/labels`.
- Legacy filters open unchanged: `Design work` lists the design-labelled task,
  `Overdue anything` lists the overdue task (completed today is not overdue),
  `Old design label` opens with no tasks.
- Another user's filter (`/filters/qa-other-filter`) and label
  (`/labels/qa-other-label`) show "Filter/Label not found" (API 404).
- Created label `Home`; in the task dialog checked `Home` and `Urgent` and saved;
  `/labels/urgent` lists the task with "2 labels".
- Deleted `Home` through the in-page confirmation ("Tasks are kept."); the task
  kept `Urgent` only ("1 label").
- Editing `Old design label` shows its stored label as "Deleted label"; saving is
  refused ("Check your entry and try again.", API 400, legacy rule). Choosing
  `Urgent` saved it; the filter then listed the task.
- Completing that task from the filter page removed it from the open-status list
  in place (task writes invalidate label/filter reads).
- Created filter `Priority two` (priority 2, any status), deleted it; its URL then
  shows "Filter not found".
- At 390×844 the directory rows wrap the Edit/Delete pair under the name.

Screenshots: `tauri-labels-filters/directory-desktop.jpg`,
`editor-labels-desktop.jpg`, `directory-390.jpg`, `label-page-390.jpg`.

## Automated coverage

- `packages/server/src/metadata.test.ts`: legacy definitions parse with only the
  defaults filled (rows are never rewritten), legacy evaluation, owner scoping,
  retry-safe creates and foreign create IDs, deleted label kept in filters and
  refused on resave, foreign label/project references (legacy messages).
- `packages/server/src/tasks.test.ts`: label assignment through `updateTask`
  (owned only, replay recognised, a stale copy cannot overwrite another device's
  label change, deleted/foreign labels refused, `[]` clears).
- `apps/api/src/metadata-routes.test.ts`: 401 envelope, `no-store`, one 404 for
  foreign and missing IDs, validation, retry (201 then 200, foreign ID 409),
  label deletion effects, Origin guard, bearer ignoring cookies.
- `apps/api/src/task-routes.test.ts`: `labelIds` pass through PATCH; a deleted or
  foreign label is `400 INVALID_INPUT`; bounds.
- `apps/client/src/metadata.test.ts`: browser transport paths/bodies/errors,
  cache invalidation (label/filter writes, label deletion, task writes), directory,
  bucketed task list, not-found states, editor checkboxes.
- `src-tauri/src/metadata.rs` and `writes.rs`: bodies rebuilt from typed fields,
  names/colors/IDs/definitions bounded, unknown predicates dropped.

## Not verified

- Native Mac/iOS runs of the nine new commands (Rust unit tests only; the
  simulator was in use by parallel tickets). Physical devices are deferred.
- The production database path (`@todalo/server/metadata` against Postgres) beyond
  the relational test boundary; production saved filters were not read.
