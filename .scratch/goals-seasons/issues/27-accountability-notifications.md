# 27: Accountability notifications

**What to build:** Habito notifies the user when a goal drops to Adjust or Off track, a scheduled primary-goal task's time passes without it being completed, or a Check-in is missed — at most two a day, outside quiet hours, each trigger toggleable — via native notifications on Mac and iPhone and browser notifications on web. Today and the week view show a banner when no primary-goal time is planned.

**Blocked by:** 15, 11

**Status:** ready-for-agent

- [ ] Three triggers, each toggleable
- [ ] Daily cap of two and quiet hours
- [ ] Native notifications on Mac and iPhone, browser notifications on web
- [ ] Banner in Today and week view when no primary-goal time is planned
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
