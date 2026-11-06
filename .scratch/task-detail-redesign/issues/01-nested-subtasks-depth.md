# 01. Nested sub-tasks up to MAX_SUBTASK_DEPTH (3)

Status: resolved
Type: task

**Blocked by:** None.

**What it delivers:** One pure rule module (`packages/db/src/task-parent-validation.ts`) holding `MAX_SUBTASK_DEPTH = 3`, depth/height/cycle checks, used by `assertTaskParent` (db), `createTask`/`updateTask`/`moveTasks` (server; moves carry the whole subtree), the Ramble commit (`apps/api/src/commit-rows.ts`), the Todoist importer (keeps up to 3 levels, warns about deeper), and the client (`parentCandidates`, recursive `treeOrder`, Ctrl+] nests under the previous sibling, Ctrl+[ outdents one level). `basicTaskInput` (and the Rust `NewTask`) accept `parentId` so the sheet's "Add sub-task" is one create.

**Acceptance:** Unit tests for: depth limit at 3 (ok) / 4 (refused), nesting a subtree that would exceed the limit, cycles (parent is a descendant), self-parent, foreign parent; importer keeps 3 levels and flattens level 4+; Ramble commit accepts 2-level staged nesting and refuses cycles; client `parentCandidates` and `treeOrder` with grandchildren. Existing single-level tests updated.

## Comments

2026-11-06: Done. `MAX_SUBTASK_DEPTH = 3` + `validateTaskParent(input, tasks)` (cycle, depth incl. moved subtree height) in `packages/db/src/task-parent-validation.ts`; `assertTaskParent` loads the user's (id, parentId) pairs. `updateTask`/`moveTasks` carry the whole subtree. Ramble commit, importer (keeps 3 levels, flattens deeper with a warning, inserts level by level), client `parentCandidates`, recursive `treeOrder`/`treeDepths`, Ctrl+] (previous sibling) / Ctrl+[ (one level up), Task page Nest for sub-tasks. `basicTaskInput.parentId` + Rust `NewTask.parent_id`. Verified in the browser: level 4 is a 400.
