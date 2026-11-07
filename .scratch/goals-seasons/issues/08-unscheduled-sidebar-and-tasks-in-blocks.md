# 08: Unscheduled sidebar

**What to build:** Next to the schedule a right sidebar (`Shift+u`) lists open tasks without a time of day. The user drags a task onto a time slot to set its start and end (a ghost shows at the drop position with its duration, 30 minutes by default), drags a scheduled task back onto the sidebar to unschedule it, filters the list by goal, project, priority and label, and sets priority without leaving the planner.

**Blocked by:** 07

**Status:** resolved

- [x] Right sidebar lists open tasks without a scheduled time
- [x] Drag a task onto a free slot to schedule it, with a live ghost at its real duration
- [x] Drag a scheduled task onto the sidebar to unschedule it (it keeps its day)
- [x] ~~Drag a task into a block to add it; a block can hold several tasks~~ (dropped: no separate block entity)
- [x] Filter by goal, project, priority and label
- [x] Set a task's priority from the sidebar
- [x] The right-sidebar container is reusable by later tickets (rituals, Coach chat)
- [x] Behaviour covered by tests (schedule rules in `schedule.test.ts`; task edits at the API seam)
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
