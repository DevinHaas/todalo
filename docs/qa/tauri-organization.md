# Organize tasks into sections and sub-tasks — ticket 13 evidence

Recorded 15 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts`, port 3313) and Vite on 5313, opened as
`http://t13.localhost:5313` (`QA_CLIENT_ORIGIN` set to match) so the session cookie
could not collide with other agents' `localhost` QA sessions. No production data; the
user's port-3001 API was not touched. Both servers were stopped afterwards.
Screenshots: [`tauri-organization/`](tauri-organization/).

The QA API seeds sections `Doing`/`Later` in Work, another user's section, and a
sectioned parent with a sub-task (`/tasks/undated-parent`, `/tasks/undated-step`). Its
move/nest rules are a memory twin of `updateTask` (`qaOrganize` in
`apps/client/scripts/qa-projects.ts`) using the same pure validators from `packages/db`.

## What was exercised

| Capture | Client | Result |
| --- | --- | --- |
| — | Chromium 1024 × 768 | Work shows "Tasks" (unsectioned) first, then `Doing`, `Later`, each with a collapse toggle and Delete section; the sub-task renders indented after its parent. |
| — | Chromium | Add section → "  Review " → created as `Review`, listed between `Doing` and `Later` (legacy order: sortOrder, then name). Delete section on `Later` removed it; collapsing `Doing` hid its tasks. |
| `move-dialog-desktop.jpg` | Chromium | Move task on the sub-task: destinations list Inbox, Errands, Work only (no other user's project); sections follow the chosen project. Moving it to Errands detached it ("Nest task" replaced "Unnest task"). |
| — | Chromium | Nest task on "Undated fixture task" (Work, no section): candidates are open root tasks of Work; nesting under "Sectioned fixture parent" moved it into `Doing` ("Sub-task of …"). |
| — | Chromium | Nest task on the parent explains "A task with sub-tasks cannot become a sub-task." |
| `sections-desktop.jpg`, `sections-mobile.jpg` | Chromium 1024 × 768 / 390 × 844 | Moving the parent to `Later` carried its sub-task; the project page refreshed without reload. Phone layout keeps section controls at touch size. |
| `move-dialog-mobile.jpg` | Chromium 390 × 844 | Move task → Inbox hides the section field; the task left the Work page. |

Covered by tests rather than by hand: cross-user sections/projects/parents (404),
cycles and depth (400), stale copies (412), bodies that mix a move and a parent, the
Rust body builders, and legacy action compatibility (`organization-actions.test.ts`).

## Not verified

- Native commands (`destinations`, `create_section`, `delete_section`, `organize_task`)
  on the iOS Simulator or Mac app — only `cargo test` of the body builders. Physical
  devices are deferred.
- The legacy web app against a real database (its actions now wrap
  `@todalo/server/organization`; covered by the relational boundary tests).
- Keyboard shortcuts for move/nest/unnest (ticket 19) and an Inbox view (moves to Inbox
  work; the list view is another ticket).
