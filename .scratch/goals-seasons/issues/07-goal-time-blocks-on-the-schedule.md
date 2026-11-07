# 07: Goal time blocks on the schedule

**What to build:** On the today and week schedule a user drags over an empty slot to create a time block, optionally dedicated to a goal, and moves or resizes it by dragging. Blocks show their goal's colour. A scheduled task appears as a block holding just that task, with no migration of existing scheduling.

**Blocked by:** 01

**Status:** resolved

- [x] Create a block by dragging over an empty slot
- [x] Dedicate a block to a goal with no tasks in it
- [x] Move and resize blocks by dragging
- [x] Blocks show the goal's colour
- [x] Existing scheduled tasks render as single-task blocks; their stored start/end are unchanged
- [x] Google Calendar events still show alongside blocks
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
