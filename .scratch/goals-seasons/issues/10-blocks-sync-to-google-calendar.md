# 10: Time blocks sync to Google Calendar

**What to build:** Time blocks appear as events in the user's Google Calendar and stay in sync when moved, resized or deleted.

**Blocked by:** 07

**Status:** resolved

- [x] Creating, moving, resizing and deleting a block updates its calendar event
- [x] Uses the existing calendar sync
- [x] Blocks are not duplicated when their own events come back through sync
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry (none added: sync rides on existing create/move/resize/delete)

Spec: ../spec.md. Vocabulary: CONTEXT.md.
