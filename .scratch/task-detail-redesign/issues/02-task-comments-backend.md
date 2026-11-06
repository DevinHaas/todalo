# 02. Task comments: table, server, API, native commands, import + backfill

Status: resolved
Type: task

**Blocked by:** None.

**What it delivers:** `task_comments` (id, user_id → user cascade, task_id → tasks cascade, body ≤ 10 000 chars, created_at; index on task_id) and migration `drizzle/0012_*`. `@todalo/server/comments` list/add/remove (owner-scoped; foreign = missing). Routes `GET/POST /api/v1/tasks/:id/comments`, `DELETE /api/v1/comments/:id` (same auth/Origin rules as tasks). Tauri commands `comments`, `add_comment`, `delete_comment`. `commentCount` on `TaskDto` via a correlated sub-select in the existing task reads. The Todoist importer writes notes as comment rows (with the note's posted time) instead of the `---` description block. `scripts/backfill-imported-comments.ts` moves existing imported `---` blocks into comments (dry run by default).

**Acceptance:** Route tests (auth, 404 for foreign, 400 for empty), importer test asserts comments rows and an untouched description, backfill split function tested. Migration + backfill applied to Neon only after the user approves.

## Comments

2026-11-06: Done. Migration `drizzle/0012_task_comments.sql` applied to Neon 2026-11-06 with the user's approval; backfill applied (8 comments on 4 tasks across Todoist-imported accounts). Backfilled comments get the task's createdAt (the old format kept no times) and description order. `commentCount` is a hand-qualified correlated sub-select (drizzle renders bare column names inside select fields). Local dev note: the API needs `RAMBLE_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173` for browser writes.
