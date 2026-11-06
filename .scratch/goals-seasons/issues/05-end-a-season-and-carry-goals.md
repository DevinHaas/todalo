# 05: End a season and carry goals forward

**What to build:** A user ends a season, picks which goals continue into the next with new targets and tiers, and can browse past seasons with their goals and targets.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] Ending a season keeps its goals, targets and tiers as history
- [ ] Selected goals carry into a new season with fresh target and tier
- [ ] Past seasons are listed and viewable read-only
- [ ] A goal can be primary in one season and secondary in the next
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
