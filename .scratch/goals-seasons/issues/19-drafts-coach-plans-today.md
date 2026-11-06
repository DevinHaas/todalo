# 19: Drafts: the Coach plans today

**What to build:** After a Check-in the Coach drafts today's plan. Drafted blocks show dashed on the schedule with a summary ('4 added, 1 moved, 1 removed') and the Coach's reasoning; the user accepts or declines the whole draft or single items. Nothing touches the real calendar before acceptance.

**Blocked by:** 17, 12

**Status:** ready-for-agent

- [ ] Draft = staged add/move/remove operations with rationale, validated as a whole
- [ ] Dashed rendering of drafted items on the schedule
- [ ] Accept or decline all, or per item; applied atomically
- [ ] Calendar and tasks unchanged until accepted
- [ ] Coach can only write drafts
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
