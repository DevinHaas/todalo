# 15: Goal status

**What to build:** Each current-season goal shows On track, Adjust or Off track, calculated by a deterministic function from progress ratings, reached milestones and block outcomes; early in a season it shows 'Too early'.

**Blocked by:** 06, 09, 11

**Status:** ready-for-agent

- [ ] Pure status function: inputs season dates, today, ratings, milestones, block outcomes; outputs weekly scores, projection and band
- [ ] Thresholds and weights are constants in one module
- [ ] Table-driven tests incl. Too early and band boundaries
- [ ] Status badges on goal pages, sidebar and season page
- [ ] No AI involved
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
