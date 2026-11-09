# 30: Coach completes, moves and deletes tasks

**What to build:** In the Coach bar (ticket 29), the user can ask the Coach to:

- **Complete:** "mark the dentist call as done".
- **Move:** "push the report to Thursday", "move the gym tasks to Health". This works for any open task: scheduled or not, to another day or time, or to another project or section.
- **Delete:** "delete the old QA tasks".

Like every Coach change, these are draft changes: nothing happens until the user confirms.

**Today:** chat drafts support add, move (only tasks already on the schedule, time or day only), remove (only takes a task off the schedule; the task stays), subtask and attach.

**Blocked by:** 29

**Status:** done

- [x] New draft change kinds:
  - `complete`: marks the task done the same way the app's own complete does, including recurring tasks, which advance to their next date.
  - `delete`: deletes the task through the app's own delete, sub-tasks included, as the app does.
  - `move` extended: any open task may get a new day, with or without a time, and/or a new project or section.
- [x] The Coach sees the open tasks it may act on, by ref, and is told to use them only when the user asks; it never proposes them on its own in day or week drafts.
- [x] Pending rendering:
  - complete: a ticked, faded row or block marked "will complete".
  - delete: red, struck through, marked "will delete".
  - move: the existing dashed style, plus the target project or section.
  - The pill counts them: "2 completed, 1 moved, 1 deleted".
- [x] Confirmation:
  - Accepting a draft confirms it.
  - Any delete in it needs a second, explicit confirm: "Delete 3 tasks? This can't be undone." (or undo, if the app has an undo for delete).
  - Keep/drop per change still works.
- [x] Stale check on accept: a task edited, completed or deleted since the draft rejects only that change.
- [x] Mac: any new route has its Rust command and permission.
- [x] Tests at the draft parser and API seam (route factory, fakes).

Notes (2026-11-09): chat drafts gain ops `complete` and `delete` (`drafts.ts` draftOps; never in day or week drafts, whose schema keeps scheduleOps) and `move` with `place` (`coach_draft_items.place` jsonb: projectId, null for the Inbox; sectionId; label "Health › Gym"; keepsDate when only the place changes; migration 0041, additive). The Coach's facts add `projects` ("p1", sections "s1", plus "inbox"); it may act on any open, non-fixed task by ref (scheduled, toPlan, tasks). A timed move of a task not on the week's schedule is placed by the week rules as an add would be. Accept applies moves through `moveTasks`, completions through `completeTasks` (recurring tasks advance; a milestone's open criteria are ticked, the accept being the confirmation) and deletions through `deleteTasks` (sub-tasks go along by cascade), after the draft batch. Stale check: a changed task's item is declined and the rest applied, with "1 change was left out…" (412 only when nothing else is left). The app has no undo for delete, so the Coach bar asks "Delete N tasks? This can't be undone." before an accept (all, per change, or the accept-draft shortcut) that deletes; it is an AlertDialog (Enter/Escape), so no new shortcut. Rendering: complete ticked and faded (styles.css `data-pending="complete"`, calendar `data-draft="complete"`), delete red, dashed and struck through, a place move "To Health" or "Due Mar 3, Health › Gym". Mac: no new route (decide_draft passes the body through).

Spec: ../spec.md. Vocabulary: CONTEXT.md.
