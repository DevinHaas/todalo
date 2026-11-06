# Project layouts and the status board — ticket 17 evidence

Recorded 16 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts`, port 3617, `QA_CLIENT_ORIGIN=http://t17.localhost:5617`)
and Vite on 5617 (`CLIENT_API_PROXY_TARGET=http://127.0.0.1:3617`), opened as
`http://t17.localhost:5617`, signed in as the seeded QA account. No production data; the
user's port-3001 API was not touched. Both servers were stopped afterwards.
Screenshots: [`tauri-board/`](tauri-board/).

The QA API's reorder route is the real `createBulkRoutes` over `qaBulkRoutes`
(`apps/client/scripts/qa-projects.ts`), which uses the shared `planReorder` and now applies
`status` the same way as `packages/server/src/bulk.ts`.

## What was exercised (Chromium, Browser pane)

| Capture | Viewport / input | Result |
| --- | --- | --- |
| `today-board-desktop.jpg` | 1024 wide, mouse | Today → Next layout shows "Board": To do / In progress / Done columns over the whole collection (done included, as legacy); the sub-task is indented under its parent; the grip appears on hover. |
| — | mouse | Dragging "Future fixture task" by its grip onto In progress: `GET /api/v1/today` → `in_progress`, appended to its project. Dragging "Daily standup notes" above "Review the migration checklist" (same Inbox collection) reordered the column; server order matched. |
| `keyboard-drag-target-desktop.jpg` | keyboard | Focus "Reorder Plan the first shared screen", Space, → : the overlay moved to In progress, the column outlined and the live region said "… is over Future fixture task."; Space dropped it (`in_progress` on the server, appended) and focus stayed on the card's grip in its new column. Space, →, → , Space moved "Undated fixture task" to Done. |
| — | keyboard cancel | Space, →, Escape: "Moving Undated fixture task was cancelled.", the card stayed in To do, server status unchanged (`todo`), focus on the grip. |
| — | failed write | "Review the migration checklist" deleted behind the page (`DELETE /api/v1/tasks/overdue-review` → 200), then dragged to In progress: reorder → `404`, the card snapped back, the alert read "This task does not exist or you do not have access to it.", and the settle refetch removed the card. |
| `project-board-desktop.jpg` | mouse | Work project in Board (layout kept across navigation, in memory like legacy); Done empty while Display → Completed tasks is off. Display dialog: Board is now an active, pressed option. Turning Completed tasks on showed the done task. Dragging "Plan the first shared screen" above "Future fixture task" (within In progress) and the done task back to To do: `GET /api/v1/projects/qa-work` returned the new order and statuses. |
| `project-calendar-desktop.jpg` | — | Next layout → Calendar on the project: the month grid lists the project's dated tasks and provider events. |
| `project-board-390.jpg`, `project-board-390-after-touch-drag.jpg` | 390 × 844, mobile emulation (`pointer: coarse`) | No page-level horizontal scroll (`scrollWidth` 390); the board scrolls sideways inside itself (342 → 704 px); grips visible (opacity .7, `touch-action: none`); card bodies keep `touch-action: auto`. A `pointerType: "touch"` drag from the "Undated fixture task" grip toward In progress auto-scrolled the board and dropped it there (server `in_progress`). A touch swipe on a card body (not the grip) started no drag. |
| — | Upcoming | Upcoming in Board shows every task in its status column (done included, legacy). |

Not verified by hand: real finger panning of the board (synthetic events cannot scroll;
the CSS contract above is what lets WebKit pan), native Mac/iOS runs and physical devices.

## Covered by tests

- `packages/server/src/bulk.test.ts`: `planReorder` appends with a null anchor (idempotent);
  `reorderTask` with `{ status }` sets the status and appends in one batch, a retry
  changes nothing, status + anchor together, and nothing is written for a foreign/missing
  task or anchor or a cross-collection anchor. Renumbering keeps every row's `updatedAt`
  while a status change moves it — the test boundary (`apps/web/lib/testing/relational-boundary.ts`)
  now applies drizzle's `$onUpdate` like the real driver, which exposed that ticket 15's
  renumbering bumped `updatedAt` on every row of the collection (fixed with a
  self-referencing `sql` value). `organization.test.ts` now edits with the copy last seen.
- `apps/api/src/bulk-routes.test.ts`: `{ status }` and anchor + status bodies; 400 for
  `{}`, an anchor without a position, a position without an anchor, unknown statuses and
  extra fields; 404 for another user's task.
- `apps/client/src/board.test.ts`: `boardDrop` (column or card in another column →
  status; same column → anchor/position; cross-collection, own column, unknown → no
  write); optimistic move to the end of Today and the project list; rollback on a failed
  write; board markup (legacy columns, tree order, grips only with a write); a project
  swaps its section list for the layout.
- `apps/client/src/bulk.test.ts`, `schedule.test.ts`: transports send `{ status }` /
  `reorder_task` with optional fields; `nextLayout` cycles list → board → calendar.
- `apps/client/src-tauri/src/bulk.rs`: `reorder_body` accepts anchor + position,
  status, or both and rejects everything else.
