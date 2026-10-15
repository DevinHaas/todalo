# 3. Read Today and open a task across all three clients

Status: in-progress (code-complete; physical iPhone and Mac app runs pending)
Type: task

**Blocked by:** 2.
   **What it delivers:** The signed-in user sees their actual Today list and a read-only task detail using the existing visual design.
   **Acceptance:** Reuse the shared query and explicit date DTOs; implement navigation, loading/empty/error states and the initial query-cache conventions; preserve basic sidebar layout, typography and fonts; reject cross-user reads. Compare screenshots and verify safe areas and software-keyboard layout where applicable.

## Comments

Published from the approved implementation proposal on 2026-10-04. Eligibility requires every listed blocker to be complete.

2026-10-15 — implemented while ticket 2's physical-device acceptance is still
pending (the user chose to continue). Evidence: `docs/qa/tauri-today.md`;
conventions: `apps/client/README.md` ("Authenticated reads").

Verified:
- `GET /api/v1/today` and `GET /api/v1/tasks/:id` reuse `@todalo/server/today`
  (`getTodayTasksForUser`, newly shared `getOwnedTask`) and return allow-listed DTOs
  with ISO date strings. Unit tests cover 401, session-only user, DTO shape and
  identical 404 for foreign/missing IDs; the browser QA run confirmed the
  cross-user 404 and "Task not found" screen.
- Browser at 1440×1000 and 390×844 against the isolated QA API: Today list,
  overdue/today grouping, sidebar count, task detail, deep link kept through
  sign-in, mobile drawer, error state and revoked-session sign-out. Screenshots
  compared with the ticket 1 baselines (within a few px; differences documented).
- iOS Simulator (iPhone 17 Pro, debug build): native `today`/`task` IPC through the
  Keychain bearer, safe-area insets at top and bottom, session survives relaunch.
- Root `bun run test`, `bun run typecheck`, `bun run build`; `cargo test`.

Not verified: physical iPhone, Mac app window, software keyboard (no text inputs
on these screens yet; simulator had a hardware keyboard attached), native
cross-user read, VoiceOver. Calendar events in Today are deferred to ticket 16/20.
