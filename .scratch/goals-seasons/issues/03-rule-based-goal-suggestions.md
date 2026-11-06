# 03: Rule-based goal suggestions

**What to build:** When a task has no goal, Habito suggests goals that sibling tasks in the same project or tasks with the same labels already link to. Suggestions are a hint the user accepts or dismisses; nothing is linked automatically.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Suggestions come from same-project and same-label links, ranked by frequency
- [ ] Accepting links the goal; dismissing hides that suggestion for the task
- [ ] No suggestion ever creates a link without a click
- [ ] Works with no AI provider configured
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
