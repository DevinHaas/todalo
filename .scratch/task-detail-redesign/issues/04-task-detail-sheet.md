# 04. Task detail sheet redesign

Status: resolved
Type: task

**Blocked by:** 01, 02.

**What it delivers:** `TaskEditor` rebuilt as the sheet in `reference-detail.png`: header (breadcrumb with project and parent chain, previous/next, `…` menu, close), main column (complete circle, large title, Description row, Sub-tasks section with progress ring, Hide completed, nested open list, Add sub-task, completed struck through; Comments section with list, delete, composer), sidebar (Project picker, Date popover with time range + repeat, Deadline, Priority, Labels). Draft + Save model kept (Cancel/Save bar when dirty); moves, sub-task and comment writes are immediate. Keyboard hooks kept: `.task-editor form`, `data-field`, `data-navigate`, `data-insert`, submit button. Light and dark themes; one column under 768px.

**Acceptance:** Existing editor tests updated (labels, Save and add, Previous/Next, Copy link, recurrence); new tests for sub-task progress and comments rendering. Side-by-side browser check against the screenshot with the Todoist import test account ("Send bills"-like task with sub-tasks and comments).

## Comments

2026-11-06: Done in `task-sheet.tsx` (view), `task-sheet-screen.tsx` (writes), `task-tree.ts`. Saving no longer closes the sheet. Checked side by side with the reference in dark and light; add sub-task, nesting to 3 levels, comment add verified in the browser. Not verified: phone layout (<768px) and the Tauri shells.
