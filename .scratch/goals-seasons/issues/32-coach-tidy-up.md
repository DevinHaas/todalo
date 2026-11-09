# 32: Coach tidies up stale tasks

**What to build:** The Coach looks at open tasks nobody has touched in a long time and helps the user decide what to do with each. It can run in two ways:
- **On request:** "tidy up my backlog" in the Coach bar, or the "Tidy up" suggestion chip.
- **Weekly nudge:** the Weekly review shows "12 tasks untouched for 30+ days. Tidy up with the Coach?", which runs the same request.

For each stale task, the Coach drafts one change with a one-line reason:
- **Park:** horizon Later.
- **Delete:** a duplicate, or something no longer relevant.
- **Complete:** looks done already.
- **Move:** to a fitting project or section.
- **Keep:** leave it as is, for a task that still matters (shown, nothing changes).

Everything is a draft in the Coach bar, grouped by kind and decided per group or per change, as with any Coach change. Deletes keep the "Delete N tasks?" confirm.

**Blocked by:** 31 (horizons; `horizon` op)

**Status:** done

- [x] Stale means open, unscheduled, not Later, with `updatedAt` older than 30 days.
  - Sub-tasks are judged with their parent.
  - Tasks linked to a primary goal are never proposed for delete.
- [x] Chat intent "tidy up": the facts list the stale tasks (by ref, with age, project, goal and priority), up to 40, oldest first. The rest wait for the next run ("40 of 63 shown").
- [x] A Keep resets the task's staleness (a `reviewedAt` stamp, migration additive), so it is not proposed again for 30 days.
- [x] Weekly review: one line with the count and a "Tidy up" button that opens the bar and sends the request; hidden when the count is 0.
- [x] Tests:
  - the staleness rule (pure);
  - the draft parser (ops limited to the stale refs);
  - the API seam with fakes.

Notes (2026-11-09): the staleness rule is `staleTasks` (task-dto.ts, pure, shared by server and client): open, top-level, no date, not Later (`effectiveHorizon`), last touched 30+ days ago, where a touch is the task's `updatedAt`, its `reviewedAt` (migration 0043 adds `tasks.reviewed_at`, additive) or any of its sub-tasks' updates; oldest touch first, with the age in days. A chat message matching `tidyIntent` (tidy, tidied, tidying) makes `chatExtras` take the first 40 stale tasks (`STALE_LIMIT`), give the ones not already in toPlan refs ahead of the other tasks, and the facts carry `stale: { shown, total, tasks: [{ ref, title, days, project, goal, priority }] }`; when more are stale the reply ends "40 of 63 stale tasks shown; the rest wait for the next tidy-up." (added by the route, not the model). In a tidy-up every item must name a stale ref and be `horizon` (park is Later), `delete`, `complete`, `move` (a project or section only, no day) or the new `keep`; a delete of a primary-goal task drops the draft; `keep` outside a tidy-up does too. Accepting a Keep stamps `reviewedAt` and leaves `updatedAt` as it was (as reorder does), so open editors stay valid and the task is fresh for 30 more days; the bar groups Keeps as "Kept" ("Stays as it is"), and deletes keep ticket 30's "Delete N tasks?" confirm. The Coach bar shows a "Tidy up" chip while stale tasks exist and the field is empty with no draft open; the Weekly review (with a Coach provider) shows "12 tasks untouched for 30+ days. Tidy up with the Coach?" on every step, whose button sends `TIDY_PROMPT` through the bar (`askCoach`). Mac: no new route. Limits: tidy intent is a keyword match, so "tidy" anywhere in a message starts a tidy-up; the chip and the Weekly review count from the client's task list, the chat from the server's, which agree unless a sync is pending.

Spec: ../spec.md. Vocabulary: CONTEXT.md (add: stale, tidy-up).
