# 21: Coach recommendations

**What to build:** The season page shows Coach recommendations per goal (e.g. 'Move Ship v2 to your mornings — its tasks were moved three times since week 5') with Update schedule, Chat with coach and dismiss.

**Blocked by:** 19, 16

**Status:** resolved

- [x] Recommendations derived from status and goal-linked tasks (completed, scheduled, moved, time spent)
- [x] Update schedule creates a draft
- [x] Chat opens the Coach chat with context
- [x] Dismiss hides the recommendation
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
