# 04 — `tasks.parentId` schema for single-level sub-tasks

**What to build:** A nullable, self-referencing `parentId` column on `tasks` (`references tasks.id`, `onDelete: "cascade"`), so a task can be a sub-task of another task. Single-level nesting only — a sub-task cannot itself have sub-tasks; this is enforced wherever tasks are created/updated, not just left as a data-model convention. Rendering the parent/child hierarchy in list/board/calendar views is explicitly out of scope for this spec — this ticket is schema and write-path validation only.

**Blocked by:** 01 (schema lives in `packages/db`).

**Status:** ready-for-agent

- [ ] `parentId` column added to `tasks`: nullable, self-referencing FK, `onDelete: "cascade"`
- [ ] Drizzle migration generated and applied
- [ ] Task creation/update paths reject setting `parentId` to a task that itself already has a non-null `parentId` (no nesting beyond one level)
- [ ] Deleting a parent task cascades to delete its sub-tasks
- [ ] Existing task queries/mutations are unaffected for tasks with `parentId: null` (no behavior change for non-Ramble task creation)
