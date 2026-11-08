# 14c: One Plan sidebar (Todoist style) for planning and the Check-in; goal icons; goal-coloured tasks

User feedback after 14b. Reference screenshot: `/Users/devinhasler/.t3/userdata/attachments/80c3a967-ee4e-40d3-be35-a732612f8aff-81adea2a-1b11-435d-b55d-77db42c5e3e5.png` (Todoist's "Plan" side panel; match its structure and density in our light theme tokens, not its dark colours).

**What to build:**

1. **Plan sidebar replaces the unscheduled sidebar.** One right sidebar beside the schedule (Today and Upcoming calendar), header "Plan" + count.
   - Project filter dropdown at the top ("All projects"), like the screenshot. Keep 14b's search box + filter chips (labels, goals) when more than 10 tasks.
   - Collapsible groups with counts: **Overdue** (with a "Reschedule" text action in the header that moves all overdue tasks to today, optimistic, undoable via toast), **Today** (due today, no time), **Next 7 days** (all-day, upcoming), **Inbox** (no date). Goal-linked tasks first inside each group.
   - Rows look like the screenshot / our list rows: completion circle (completes the task), title (wraps to two lines), a meta line underneath: date in its tone (overdue red, today/tomorrow coloured as in our list rows), sub-task progress (`1/3` with icon), comment count with icon, and the project (with its icon) right-aligned. Hover shows a "…" more button.
   - Rows drag onto the calendar (live ghost, as today). Dragging a scheduled block back onto the sidebar unschedules it (keep the existing behaviour). Clicking a row opens the task sheet.
   - Scheduling without dragging: a hover "schedule" button on the row opens a small popover with the time field and a "Schedule today" button grouped together, plus a due date field. (The 14b "Leave" action becomes: just don't schedule it; in the Check-in only, keep a quiet "Leave" in the "…" menu so it drops from the list.)
   - "+ Add task" at the bottom of the list (composer into the Inbox, like the screenshot).
   - Delete the old `UnscheduledSidebar` and its toolbar toggle wording ("Unscheduled" button becomes "Plan"); keyboard command `schedule.unscheduled` toggles the Plan sidebar (rename label).
2. **The Check-in uses the same Plan sidebar.** No separate candidate cards. While the Check-in runs, the Plan sidebar shows its ritual header on top: title "Check-in", the progress bar, Skip and close, a one-line hint, then the same groups/rows, and a Done button at the bottom. The Check-in still opens Today's calendar. Drop the second "schedule" step (the sidebar and calendar are already side by side); Done completes. Keep the existing Check-in shortcuts working against the new rows (schedule the focused row at its slot, leave, next/done, search).
3. **Goal icons with coloured backgrounds.** A goal gets an `icon` (lucide icon name from a curated list of ~30, e.g. target, rocket, dumbbell, book-open, heart, briefcase, graduation-cap, piggy-bank, music, plane, leaf, code…; default `target`). Additive migration: `goals.icon text not null default 'target'`. Icon picker next to the colour picker in the goal editor. Everywhere a goal is shown (sidebar Goals list, goal page header, season page, task sheet goal chip, Plan sidebar meta, rating steps) render the icon in white/foreground on a rounded square filled with the goal colour (one shared `GoalIcon` component in `goal-views.tsx`, replacing `GoalDot` where it reads as the goal's identity).
4. **Tasks linked to a goal take its colour.** In list rows (Today/Inbox/Project/Upcoming list), the Plan sidebar and the board: the completion circle ring is the goal colour, and a small `GoalIcon` sits in the meta line. Calendar blocks already use the goal colour; keep them. Hidden Goals: no colours, as today.

**Status:** resolved

- [x] Plan sidebar with project filter, Overdue/Today/Next 7 days/Inbox groups, Reschedule overdue, rows per screenshot (circle, title, date tone, sub-tasks x/y, comments, project), add task
- [x] Drag to calendar and back; schedule popover groups time + Schedule today + due date
- [x] Unscheduled sidebar removed; Check-in renders inside the Plan sidebar with progress bar, Skip, Done
- [x] Goal icon column (additive migration, applied), picker, shared GoalIcon on coloured square everywhere goals show
- [x] Goal-linked task rows show goal colour on the circle and the goal icon
- [x] Tests at the API seam for the icon field; pure grouping logic table-tested; existing tests updated, not deleted without replacement
- [x] Keyboard commands for every new action (Reschedule overdue, add task in Plan, schedule popover), no clashes
- [x] Screenshots in docs/qa/plan-sidebar/
