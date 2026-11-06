# 12: Check-in planning step

**What to build:** After reflecting, the Check-in asks 'Do you need help planning today?'. 'No, I've got a clear idea' ends it; 'Yes' shows today's schedule and the unscheduled sidebar so the user can plan by hand.

**Blocked by:** 11, 08

**Status:** ready-for-agent

- [ ] Planning question with both answers
- [ ] Yes opens today's schedule with the unscheduled sidebar
- [ ] No completes the Check-in
- [ ] Works without an AI provider
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
