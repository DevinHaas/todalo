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

**Status:** proposed

- [ ] Stale means open, unscheduled, not Later, with `updatedAt` older than 30 days.
  - Sub-tasks are judged with their parent.
  - Tasks linked to a primary goal are never proposed for delete.
- [ ] Chat intent "tidy up": the facts list the stale tasks (by ref, with age, project, goal and priority), up to 40, oldest first. The rest wait for the next run ("40 of 63 shown").
- [ ] A Keep resets the task's staleness (a `reviewedAt` stamp, migration additive), so it is not proposed again for 30 days.
- [ ] Weekly review: one line with the count and a "Tidy up" button that opens the bar and sends the request; hidden when the count is 0.
- [ ] Tests:
  - the staleness rule (pure);
  - the draft parser (ops limited to the stale refs);
  - the API seam with fakes.

Spec: ../spec.md. Vocabulary: CONTEXT.md (add: stale, tidy-up).
