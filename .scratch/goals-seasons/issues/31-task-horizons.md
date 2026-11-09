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

**Status:** done

- [x] `tasks.horizon`: `now | next | later`, null for unsorted. Migration, additive; existing tasks stay null.
  - Moving a task into a project, or giving it a horizon, sorts it.
  - A scheduled task keeps its horizon.
- [x] Set the horizon from:
  - the task row menu;
  - the task sheet;
  - keys (registry): h then n (Now), h then x (Next), h then l (Later);
  - multi-select.
- [x] Plan sidebar sections as above, collapsed state remembered per user. Within a section the order is:
  1. primary-goal tasks;
  2. secondary-goal tasks;
  3. by priority;
  4. oldest first.
- [x] Coach drafts (day, week, chat, planning session):
  - toPlan adds Now tasks, then Next tasks, from all projects.
  - Inbox tasks stay but rank after Next.
  - Later tasks are never proposed unless the user asks for them by name.
  - Priority joins the ranking after goal tier.
- [x] Later is not hidden: projects and the Inbox still list Later tasks (muted, "Later" chip). A due date on a Later task brings it back into planning when it is due.
- [x] The Coach chat may set a horizon as a draft change: op `horizon`, shown and accepted in the bar like the others; the group is labelled "Re-sorted".
- [x] Tests at the draft parser (ranking, Later excluded) and API seam (route factory, fakes); Mac: any new route has its Rust command and permission.

- [x] Decision (2026-11-09): the Now section warns when its tasks need more time than the week has free ("Now has 14 h; about 9 h are free this week"). Free time is the open time left this week, after scheduled tasks and calendar events, using the same rules as ticket 28's overflow. A task without an estimate counts as 30 min.

Notes (2026-11-09): `tasks.horizon` (text, `now | next | later`, null) and `coach_draft_items.horizon` come with migration 0042, additive. Sorting is a rule, not a write: `effectiveHorizon` (task-dto.ts) gives a task's horizon, a project task without one being Next and an Inbox task without one unsorted; so moving a task into a project sorts it, and scheduling never clears a horizon. The horizon is set through the existing bulk metadata route (`horizon`, null to unsort): the row menu (Horizon submenu), the task sheet (Horizon property, saved at once like the project), keys `h then n|x|l` (registry `task.horizon-now|next|later`, no conflicts; they act on the focused row or the selection) and the selection toolbar's Horizon picker. Mac: no new route; `bulk_metadata` (bulk.rs) accepts `horizon`, with a test. The Plan sidebar keeps Overdue, Today and Next 7 days for dated tasks and adds Now, Next, Inbox and Later for undated top-level ones (a dated Later task shows by its date, so it comes back when due); Inbox and Later start collapsed and the open/closed sections are kept per user in localStorage (`todalo:plan-closed:<userId>`), so per device too. Within the undated sections: primary-goal tasks, secondary-goal tasks, other goal tasks, then priority, then oldest (`createdAt`, now in TaskDto); the season's tiers come from the current season read. The Now warning compares Now's minutes (each task's length, 30 min without one) with `freeMinutesLeft`: 08:00-22:00 from now to Sunday, less timed open tasks and timed events (ticket 28's OVERFLOW_HOURS). Coach: dayPlan and weekPlan (so day, week, chat and planning drafts) add Now and Next tasks of every project, then the Inbox's unsorted, never Later; toPlan ranks goal tier, priority, then how a task waits, then due day, then oldest (`TO_PLAN_RULE` in each prompt). Later tasks reach the chat only as other tasks marked `later: true`, which the prompt says to leave alone unless named. Chat op `horizon` (task ref plus `now|next|later`) shows as "To Later", is counted "re-sorted" and grouped "Re-sorted" in the bar; accepting writes only the horizon. Projects and the Inbox list Later tasks muted with a "Later" chip.

Spec: ../spec.md. Vocabulary: CONTEXT.md (add: horizon, Now, Next, Later, unsorted).
