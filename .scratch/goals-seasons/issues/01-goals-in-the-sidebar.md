# 01: Goals in the sidebar

**What to build:** A user can create, rename, describe, archive and reorder goals; goals appear as the top section of the sidebar; each goal has a page. Users who don't want goals can hide them in settings, and everything else keeps working.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Goals are stored per user and listed in the sidebar above projects
- [ ] Create, rename, edit description, archive and reorder goals
- [ ] A goal page shows the goal's title and description
- [ ] Archived goals disappear from the sidebar but keep their data
- [ ] A settings toggle hides goals from the sidebar; projects and tasks are unaffected
- [ ] Works in the browser, Mac and iPhone layouts
- [ ] Behaviour covered by tests at the API seam (route factory with in-memory fakes), following the existing route tests
- [ ] Any new user action has a keyboard command in the shortcut registry

Spec: ../spec.md. Vocabulary: CONTEXT.md.
