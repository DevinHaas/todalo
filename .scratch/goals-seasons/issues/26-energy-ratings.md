# 26: Energy ratings

**What to build:** A user rates an occurrence of a task (scheduled or not) or calendar event as Energizing or Draining with one key or tap. Recent ratings count more; the Coach uses them for patterns and planning.

**Blocked by:** 07, 24

**Status:** ready-for-agent

- [ ] Rate per occurrence for tasks (including scheduled ones on the schedule) and calendar events
- [ ] Optional, one key or tap
- [ ] Recency-weighted aggregation
- [ ] Feeds patterns and Coach drafts
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
