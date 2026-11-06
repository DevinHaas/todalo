# Task detail redesign, nested sub-tasks, comments, list indicators

Status: resolved

References: `reference-detail.png` (detail sheet, dark theme), `reference-list-indicators.png` (list rows).

## Problem

The shared client's task editor (`TaskEditor` in `apps/client/src/views.tsx`, opened over a list by
`TaskDialogHost` and on `/tasks/:id` by `TaskScreen` in `shell.tsx`) is a plain form dialog. Users want
the Todoist-style task sheet from the reference: breadcrumb header, a large title, sub-tasks with
progress, comments, and a property sidebar. Sub-tasks are limited to one level everywhere (db
validation, server, Ramble commit, importer, client nest commands). Comments imported from Todoist
are stuck at the bottom of the description after a `---` line. List rows give no hint that a task
has sub-tasks or comments.

## Decisions (with the user, 2026-11-06)

- **Comments are real.** A new `task_comments` table (id, user_id, task_id, body, created_at),
  cascading with the task. You can list, add and delete comments (no editing in v1). The Todoist
  importer writes notes as comment rows. A one-off backfill moves existing imported `---` blocks
  (only on tasks that have a Todoist `import_mappings` row) into comment rows, one per
  blank-line-separated paragraph, and strips the block from the description. Applying the migration and
  the backfill to Neon needs the user's go-ahead.
- **Reminders and Location are omitted** (no backend). The sidebar ends after Labels, and the list
  shows no alarm icon.
- **Depth:** `MAX_SUBTASK_DEPTH = 3` in `packages/db/src/task-parent-validation.ts`. That's the number of
  ancestors a task may have: a root is depth 0, its sub-task depth 1, and so on, up to depth 3. That allows
  three sub-task levels, where today's limit is one. Raising the constant to 5 is the only change needed later.
- **Sub-task count = direct children** (done/total). Each level shows its own count. A grandchild
  counts only toward its own parent. The count is derived on the client from the full task collection the
  client already holds (the Today read returns every owned task and is always loaded for the sidebar
  badge), so it costs no extra query and follows optimistic completion instantly.
- **Comment count** is a correlated sub-select inside the existing task select
  (`getTasksForUser`, `getOwnedTask`), so it's still one task query per list. It ships as `commentCount`
  on `TaskDto`.
- **Editing model stays a draft with explicit Save**, which keeps the stale-edit (TASK_CHANGED)
  handling, Save and add above/below, and the keyboard commands. Title, description, date, deadline,
  priority and labels change the draft, and a Cancel/Save bar appears once it's dirty. Project changes
  (a move) and sub-task/comment writes save immediately. They don't touch draft fields, so the editor
  rebases its version after a move and keeps any draft.
- **Completion stays per task.** Completing a parent doesn't complete its sub-tasks (unchanged
  behaviour), and recurrence advances only the completed task.
- The comment composer's paperclip isn't shipped (attachments have their own panel on the task page).

## Behaviour

### Nesting rules (one shared pure module, used by server, Ramble commit and client)
- A parent must be the same user's task, not the task itself, and not one of its descendants (no cycles).
- `depth(parent) + 1 + height(task) <= MAX_SUBTASK_DEPTH`, where height is the length of the task's
  deepest descendant chain (0 for a leaf).
- Nesting joins the parent's project and section. Moving a task (single or bulk) carries its whole
  subtree, and a moved task whose parent stays behind becomes a root.
- Deleting a task cascades to every descendant (existing FK `ON DELETE CASCADE`).
- Keyboard nest (Ctrl+]) makes the task a child of the previous sibling, which is the nearest row
  above at the same depth. Unnest (Ctrl+[) moves it one level up, to the grandparent, rather than to the root.
- The Todoist importer keeps up to `MAX_SUBTASK_DEPTH` levels. Deeper items attach to their ancestor at
  the max depth, and the import warns about them.

### List rows (Today, Inbox, projects, Upcoming, labels/filters, search)
- First line: completion circle and title. Second line: due date/time in green with a calendar icon
  (red when overdue), deadline, priority flag, labels, a sub-task indicator (branch icon, `done/total`,
  `>` chevron) and a comment indicator (bubble icon and count). The project name and icon sit at the
  right end of the second line.
- Indicators appear only when non-zero. A row with nothing on line two still shows the project.
- Rows are separated by thin dividers. The focused row gets a highlighted background and a blue
  rounded outline.
- Sub-tasks shown in the list are indented by depth. The chevron collapses them when they're already in the
  list, or expands them inline (indented, recursively) when the view filtered them out (for example, Today).

### Detail sheet
- Header: breadcrumb (project icon and name, then parent titles for a sub-task, each linking to that
  task), previous/next arrows, a `…` menu (Task link, Copy link, Save and add above/below, Delete),
  and close.
- Main column: completion circle and a large title, then a Description placeholder row with an icon (auto-growing).
  - Sub-tasks: collapsible header with a progress ring and `done/total`, plus a "Hide completed" toggle
    when some are done. Open sub-tasks come first, each with its nested children indented and its own count.
    An "+ Add sub-task" row follows (hidden at max depth), and completed sub-tasks come last, struck through.
    Clicking a sub-task opens it in the sheet.
  - Comments: collapsible "Comments N", then each comment with an avatar, name, `22 Oct 17:17`, and a linkified body
    with a delete action. A composer (avatar and rounded "Comment" input) comes last.
- Sidebar (slightly different background, rows separated by dividers): Project (picker), Date (green
  calendar and label; a popover with date, time range and repeat), Deadline (+ or the date), Priority (flag
  and P1–P4), and Labels (+ or chips).
- Works in dark and light themes through the existing CSS variables, and narrows to one column on phones.

## Out of scope
Comment editing, comment attachments, reminders, locations, completing a subtree in one step, and
cross-user (shared project) comments.

## Tickets
See `issues/01` to `issues/05`.
