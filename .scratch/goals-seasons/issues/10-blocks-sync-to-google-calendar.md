# 10: Time blocks sync to Google Calendar

**What to build:** Time blocks appear as events in the user's Google Calendar and stay in sync when moved, resized or deleted.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Creating, moving, resizing and deleting a block updates its calendar event
- [ ] Uses the existing calendar sync
- [ ] Blocks are not duplicated when their own events come back through sync
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
