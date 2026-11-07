# 12: Check-in planning step

**What to build:** After reflecting, the Check-in asks 'Do you need help planning today?'. 'No, I've got a clear idea' ends it; 'Yes' shows today's schedule and the unscheduled sidebar so the user can plan by hand.

**Blocked by:** 11, 08

**Status:** resolved

- [x] Planning question with both answers
- [x] Yes opens today's schedule with the unscheduled sidebar
- [x] No completes the Check-in
- [x] Works without an AI provider
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
