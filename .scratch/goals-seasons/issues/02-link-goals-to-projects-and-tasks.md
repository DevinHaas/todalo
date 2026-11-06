# 02: Link goals to projects and tasks

**What to build:** A user links a goal to many projects and links any task to one or more goals, so a task like 'Eat enough protein' counts for both 'Become fit' and 'Build muscle'. Linking is always explicit.

**Blocked by:** 01

**Status:** resolved

- [x] Goal ↔ project links are many-to-many
- [x] Goal ↔ task links are many-to-many
- [x] Goals can be linked from the task editor and from the project page
- [x] The goal page lists linked projects and linked tasks
- [x] Unlinking removes only the link, never the task or project
- [x] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [x] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
