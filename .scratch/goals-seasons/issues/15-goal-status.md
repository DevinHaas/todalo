# 15: Goal status

**What to build:** Each current-season goal shows On track, Adjust or Off track, calculated by a deterministic function from progress ratings, reached milestones, and goal-linked tasks completed or scheduled with the time spent on them; early in a season it shows 'Too early'.

**Blocked by:** 06, 07, 11

**Status:** ready-for-agent

- [ ] Pure status function: inputs season dates, today, ratings, milestones, and per week the goal-linked tasks completed and scheduled with their minutes (a task's time is its start to end, 30 minutes without an end; a scheduled task whose time passed uncompleted counts as planned but not kept); outputs weekly scores, projection and band
- [ ] Thresholds and weights are constants in one module
- [ ] Table-driven tests incl. Too early and band boundaries
- [ ] Status badges on goal pages, sidebar and season page
- [ ] No AI involved
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
