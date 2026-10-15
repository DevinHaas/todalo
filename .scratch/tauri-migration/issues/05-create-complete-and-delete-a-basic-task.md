# 5. Create, complete and delete a basic task

Status: in-progress (code-complete; legacy web app against a database, physical iPhone and Mac app runs pending)
Type: task

**Blocked by:** 3.
   **What it delivers:** A user adds a nonrecurring task, sees it in Today or Inbox, completes it or deletes it, and sees the result in the legacy web app.
   **Acceptance:** Extract only these server operations and reuse them from both transports; preserve validation, authorization, existing calendar side effects and cache/count updates; test ambiguous create/completion responses using operation IDs before enabling retries; retain input on failure. Rich editing and recurrence controls follow in ticket 11.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented. Evidence: `docs/qa/tauri-tasks.md`; conventions:
`apps/client/README.md` ("Task writes").

Verified:
- `createTask`, `completeTask`, `deleteTask` (with their calendar writes, label
  helpers and input schemas) moved to `@todalo/server`; the legacy Server Actions
  wrap them and existing legacy action tests pass. `POST /api/v1/tasks`,
  `POST /api/v1/tasks/:id/complete`, `DELETE /api/v1/tasks/:id` call the same
  functions. Tests cover validation, session-only user, cross-user 404/409,
  cookie-write Origin checks and no-store.
- Operation IDs: the client-generated task ID makes a replayed create return the
  original task with no second side effect; completion carries the seen
  `occurrence`, so a replay is a no-op. Server, API and client tests cover lost
  responses; retries (two, only for connection/server failures) were then enabled.
  Browser and iOS runs against `QA_AMBIGUOUS_WRITES=1` produced one task each.
- Browser at 1440×1000 and 390×844: Today composer, sidebar Inbox quick add,
  completion and delete with immediate list/count updates and rollback, detail
  Complete/Delete, draft kept when the API is down.
- iOS Simulator (iPhone 17 Pro, debug build): native `create_task`,
  `complete_task`, `delete_task` through the Keychain bearer.

Not verified: the result in the legacy web app against a real database, real
Google Calendar effects, software keyboard on a device (simulator had a hardware
keyboard), physical iPhone and Mac app.
