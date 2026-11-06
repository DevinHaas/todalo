# 07: Goal time blocks on the schedule

**What to build:** On the today and week schedule a user drags over an empty slot to create a time block, optionally dedicated to a goal, and moves or resizes it by dragging. Blocks show their goal's colour. A scheduled task appears as a block holding just that task, with no migration of existing scheduling.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] Create a block by dragging over an empty slot
- [ ] Dedicate a block to a goal with no tasks in it
- [ ] Move and resize blocks by dragging
- [ ] Blocks show the goal's colour
- [ ] Existing scheduled tasks render as single-task blocks; their stored start/end are unchanged
- [ ] Google Calendar events still show alongside blocks
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
