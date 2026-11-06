# Reorder tasks and apply bulk actions — ticket 15 evidence

Recorded 16 October 2026 against the isolated in-memory QA API
(`apps/client/scripts/auth-smoke-server.ts`, port 3615) and Vite on 5615, opened as
`http://t15.localhost:5615` (`QA_CLIENT_ORIGIN` set to match). No production data; the
user's port-3001 API was not touched. Both servers were stopped afterwards.
Screenshots: [`tauri-bulk/`](tauri-bulk/).

The QA API's bulk routes are the real `createBulkRoutes` over a memory twin
(`qaBulkRoutes` in `apps/client/scripts/qa-projects.ts`) that uses the same pure
pieces as the server: `planReorder`, `planCompletion`, the organization validators,
and the "every selected task must be the user's" check. Its array order is the
manual order.

## What was exercised

| Capture | Client | Result |
| --- | --- | --- |
| `today-toolbar-desktop.jpg` | Chromium 800 × 600 | Today → Select shows a checkbox per row; selecting two tasks shows the legacy toolbar (Complete, Delete, Priority, Labels, Deadline, plus Move and Clear date for touch, Clear selection) and an outlined row per selected task. Priority → "Choose priority for 2 tasks" → Priority 1 set P1 on both; Labels → Urgent replaced both tasks' labels ("1 label"); the selection stayed, as in legacy. |
| `today-partial-completion.jpg` | Chromium | With one selected task's date cleared behind the page (stale copy), Complete completed the other, advanced the recurring "Daily standup notes" to tomorrow and said "1 task changed on another device and was not completed." |
| — | Chromium (page `fetch`) | `POST /api/v1/bulk/delete` with one own and one other-user ID → `404 NOT_FOUND`; the own task was still listed in Work afterwards (nothing written). |
| `project-after-drag-desktop.jpg` | Chromium, mouse | Work: dragging "Undated fixture task" by its grip above "Plan the first shared screen" reordered the list and `GET /api/v1/projects/qa-work` returned the new order. |
| — | Chromium, keyboard | Focus "Reorder Future fixture task", Space, ↑, ↑, Space: moved to the top, focus stayed on the handle, and the live region announced "Future fixture task was dropped at Undated fixture task." Server order matched. |
| — | Chromium 390 × 844, touch emulation | `(pointer: coarse)` true; handles visible (opacity .7) inside the 16 px gutter with `touch-action: none`; no horizontal scroll (scrollWidth 390). A pointer drag with `pointerType: "touch"` on "Plan the first shared screen" moved it to the top (server order confirmed). |
| `project-bulk-move-390.jpg` | Chromium 390 × 844 | Selecting two Work tasks → Move → Errands ("Move tasks") moved both; they appeared at the end of Errands in their previous order and left Work; the toolbar closed. |
| `project-stale-selection-390.jpg` | Chromium 390 × 844 | A selected task deleted behind the page, then Complete: "Some selected tasks no longer exist. Nothing was changed; the list has been refreshed." and the list refetched. |

Covered by tests rather than by hand:
- `packages/server/src/bulk.test.ts` (relational boundary, now with an atomic `batch`):
  a mixed own/foreign selection writes nothing for complete, delete, clear-date,
  metadata and move (rows and calendar effects compared before/after); a foreign label
  writes nothing; a retried completion tap does not advance a recurring task twice;
  reorder is relative to the current order, idempotent on retry, leaves other projects
  and `updatedAt` alone, and refuses foreign/missing anchors and cross-collection moves;
  bulk move appends in current order and re-applies identically.
- `apps/api/src/bulk-routes.test.ts`: auth (bearer, cookie + Origin, 403), strict bodies
  (400, including deleted labels and bad reorder positions), one 404 for mixed
  selections with no write, typed values passed through.
- `apps/client/src/bulk.test.ts`: transports (fixed paths/commands), optimistic delete +
  rollback when nothing was written, a retried delete that finds the tasks gone counts as
  applied, one tap ID per completion, optimistic reorder, toolbar and handle markup.
- `apps/client/src-tauri/src/bulk.rs`: body builders (selection bounds, ID validation,
  exactly one metadata field, Inbox without section, reorder positions).

## Not verified

- Native commands (`bulk_complete`, `bulk_delete`, `bulk_clear_date`, `bulk_metadata`,
  `bulk_move`, `reorder_task`) in the iOS Simulator or Mac app — `cargo test` only.
  Touch drag was verified with Chromium touch emulation and synthetic touch pointer
  events, not in WKWebView; physical devices are deferred.
- The legacy web app against a real database (its bulk actions now wrap
  `@todalo/server/bulk`; covered by the relational boundary tests).
- Neon's batch transaction itself (the boundary models it; production uses
  `db.batch`, a single non-interactive transaction on neon-http).
- Keyboard shortcuts for selection (X, `,`) and bulk actions (ticket 19), and board
  drag between columns (ticket 17).
