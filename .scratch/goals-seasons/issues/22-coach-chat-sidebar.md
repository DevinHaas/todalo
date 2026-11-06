# 22: Coach chat sidebar

**What to build:** A user chats with the Coach in the right sidebar about their goals and plan; any change it proposes arrives as a draft.

**Blocked by:** 19

**Status:** ready-for-agent

- [ ] Chat in the right sidebar with goal and schedule context
- [ ] Proposed changes become drafts, never direct edits
- [ ] Chat history kept per user
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
