# 07: Goal time blocks on the schedule

**What to build:** A time block is a task with a start and duration; there is no separate block entity. On the today and week schedule every such task shows as a block in its goal's colour (the first linked goal in sidebar order, else the neutral task colour). The user drags over an empty slot to create a task with that time range (the quick add opens with it), drags a task to move it and drags its bottom edge to resize it, with a live ghost snapped to the grid that commits on mouse-up. Overlapping tasks and Google Calendar events sit side by side.

**Blocked by:** 01

**Status:** resolved

- [x] Drag over an empty slot to create a task with that time range
- [x] ~~Dedicate a block to a goal with no tasks in it~~ (dropped: a block is a task; link the task to the goal)
- [x] Move and resize scheduled tasks by dragging, with a live preview snapped to the grid
- [x] Scheduled tasks show their first goal's colour (sidebar order), else the neutral task colour
- [x] Existing scheduled tasks are the blocks; their stored start/end are the only data
- [x] Google Calendar events still show alongside, overlaps laid out side by side (pure `overlapColumns`, table-driven tests)
- [x] Repeated drags and resizes never report "changed on another device" (task edits are queued and rebased in `taskMutations.update`)
- [x] Right-click menu on tasks everywhere (rows, board cards, schedule blocks, sidebar) and an Unschedule action (task sheet … menu, `Shift+h`)
- [x] Behaviour covered by tests (client task-mutation and schedule tests; task edits already covered at the API seam)
- [x] Any new user action has a keyboard command in the shortcut registry

Rework (stage 2 feedback): the `time_blocks` / `time_block_tasks` tables were dropped in migration 0023.

Spec: ../spec.md. Vocabulary: CONTEXT.md.
