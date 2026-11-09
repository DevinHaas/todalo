# 31: Now, Next and Later for unscheduled tasks

**What to build:** A task without a time gets a horizon:
- **Now:** the next things to plan.
- **Next:** default for a sorted task.
- **Later:** parked; still visible, but out of the way.

The Inbox stays what it is: an unsorted place to capture things and come back to later. Sorting a task means giving it a horizon, a project, or both.

When planning (the Plan sidebar beside Today and the week), unscheduled tasks get their own collapsible sections, ordered:
1. Now (open)
2. Next (open)
3. Inbox, unsorted (collapsed)
4. Later (collapsed)

Each section shows its count. A task can be dragged from any section to the calendar, as today.

**Today:**
- The Coach plans from Inbox tasks plus overdue tasks and tasks due today or this week (`drafts.ts` toPlan).
- Project tasks without a date are never offered.
- Priority (P1–P4) is stored but ignored when planning.
- With many tasks pasted in, nothing tells the user what to focus on.

**Blocked by:** none (uses 19, 20, 29, 30)

**Status:** proposed

- [ ] `tasks.horizon`: `now | next | later`, null for unsorted. Migration, additive; existing tasks stay null.
  - Moving a task into a project, or giving it a horizon, sorts it.
  - A scheduled task keeps its horizon.
- [ ] Set the horizon from:
  - the task row menu;
  - the task sheet;
  - keys (registry): h then n (Now), h then x (Next), h then l (Later);
  - multi-select.
- [ ] Plan sidebar sections as above, collapsed state remembered per user. Within a section the order is:
  1. primary-goal tasks;
  2. secondary-goal tasks;
  3. by priority;
  4. oldest first.
- [ ] Coach drafts (day, week, chat, planning session):
  - toPlan adds Now tasks, then Next tasks, from all projects.
  - Inbox tasks stay but rank after Next.
  - Later tasks are never proposed unless the user asks for them by name.
  - Priority joins the ranking after goal tier.
- [ ] Later is not hidden: projects and the Inbox still list Later tasks (muted, "Later" chip). A due date on a Later task brings it back into planning when it is due.
- [ ] The Coach chat may set a horizon as a draft change: op `horizon`, shown and accepted in the bar like the others; the group is labelled "Re-sorted".
- [ ] Tests at the draft parser (ranking, Later excluded) and API seam (route factory, fakes); Mac: any new route has its Rust command and permission.

Open question: should the Now section warn when it holds more than about a week's capacity ("Now has 14 h; about 9 h are free this week")?

Spec: ../spec.md. Vocabulary: CONTEXT.md (add: horizon, Now, Next, Later, unsorted).
