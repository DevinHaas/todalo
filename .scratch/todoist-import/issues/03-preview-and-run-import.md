# 03. Preview and run the import (server)

Status: resolved
Type: task

**Blocked by:** 01, 02.

**What it delivers:** `GET /api/v1/imports/todoist` (status + preview from one Todoist sync call) and `POST /api/v1/imports/todoist/run` (selection → transactional insert via the ticket 01 planner, mappings recorded, token deleted, summary returned). Completed tasks fetched only when selected.

**Acceptance:** Selection is validated (project IDs must belong to the snapshot). Running twice creates nothing the second time. A failed Todoist call or DB error leaves no partial import and keeps the session retryable until expiry. Concurrent runs for the same user are rejected. Affected user queries are published over the live channel so open clients refresh. Tests with a fake Todoist API fixture.

## Comments

2026-11-06 — Done (same files + `packages/server/src/todoist-import-run.ts`). One Neon batch = one transaction. Completed tasks: last ~3 months (Todoist's per-request window). Deviation: no live-channel publish (only a `calendar` topic exists); the importing client invalidates its queries and other devices refetch on focus. DB code not yet run against Postgres: needs migration 0011 applied.
