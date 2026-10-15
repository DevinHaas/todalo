# 8. Create and open projects in the shared client

Status: in-progress (code-complete; native iOS/Mac project commands and physical iPhone runs pending)
Type: task

**Blocked by:** 3.
   **What it delivers:** The user lists, creates, renames and deletes projects and opens their existing tasks.
   **Acceptance:** Preserve project data, deletion semantics, ownership and navigation counts in both clients; migrate the project routes and required server operations; test existing task membership and empty/error states. Sections and task moves follow separately.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented. Evidence: `docs/qa/tauri-projects.md`; conventions:
`apps/client/README.md` ("Projects and writes").

Verified:
- `/api/v1/projects` list/open/create/rename/delete reuse the new shared
  `@todalo/server/projects` operations, which the legacy Next actions and
  `lib/organization.ts` now call too. Unit tests cover 401, session-only user,
  identical 404 for foreign and missing IDs on read/rename/delete, name validation,
  member-task membership, delete keeping tasks (Inbox) and the cookie-write Origin check.
- Browser at 1440×1000 and 390×844 against the isolated QA API: deep link through
  sign-in, create (trimmed), open with member tasks and count, rename, delete with
  confirmation, tasks moved to Inbox with the Today count unchanged, foreign project
  "not found", empty and error states, no horizontal overflow.
- Clean checkout of the commit: root test, typecheck, build; `cargo fmt --check`,
  `cargo test --locked` (Rust name validation).

Not verified: native project commands end to end on iOS (the build launched but the
shared simulator was force-quit by another agent's session before sign-in), Mac app,
physical iPhone, legacy Next screens in a browser. Sections, sorting, board/calendar
and project attachments follow in tickets 13, 16/17 and 9.
