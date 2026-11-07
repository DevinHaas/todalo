# 08: Unscheduled sidebar and tasks in blocks

**What to build:** Next to the schedule a right sidebar lists open unscheduled tasks. The user drags a task onto a time slot or into an existing block, filters the list by goal, project, priority and label, and sets priority without leaving the planner.

**Blocked by:** 07

**Status:** resolved

- [x] Right sidebar lists open tasks without a scheduled time
- [x] Drag a task onto a free slot to schedule it
- [x] Drag a task into a block to add it; a block can hold several tasks
- [x] Filter by goal, project, priority and label
- [x] Set a task's priority from the sidebar
- [x] The right-sidebar container is reusable by later tickets (rituals, Coach chat)
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
