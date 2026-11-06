# 01. Import mapping table and pure Todoist mapper

Status: resolved
Type: task

**Blocked by:** None.

**What it delivers:** `import_mappings` table (`userId, provider, kind, externalId, localId`, unique on the first four, cascade on user) with a migration, and a pure `planTodoistImport(snapshot, selection, existingMappings, existingLabels, timeZone)` in `packages/server` that returns rows to insert plus warnings.

**Acceptance:** Unit tests cover every mapping rule in `../spec.md` (project flattening, Inbox, sub-task depth, priority inversion, all-day vs timed due, duration, deadline, recurring parse + fallback, label reuse by name, comments, ordering) and skipping of already-mapped IDs. No network or DB in the planner.

## Comments

2026-11-06 — Done. `import_mappings` + `user_settings.import_prompt_seen_at` (for ticket 05) in `drizzle/0011_todoist_import.sql` (not yet applied). Planner `packages/server/src/todoist-import.ts`, 12 tests. `zonedTaskDate` moved to `@todalo/server/dates` (api re-exports). Mapping has no FK on localId; the run step must drop mappings whose row is gone before planning.
