# 03: Inbox, projects, sections, search and task organization

Type: task
Status: claimed
Blocked by: 01

## What to build

Deliver Inbox/project/Home navigation, searchable Quick Find, project menus and section navigation/creation, task move/reveal, date/name sorting, nesting/unnesting and subtask expansion. Add necessary authenticated persistence/actions/pages. Resolve documented context ambiguities explicitly and retain disputed parity notes.

## Acceptance criteria

- [ ] Working Inbox, project index/detail, Home and search/Quick Find entry points and command bindings.
- [ ] Owned project/section/task mutations reject cross-account relationships and persist organization.
- [ ] Task move/reveal, section navigation, sorting and subtask keyboard commands work with effective bindings.
- [ ] Account ownership and organization behaviors covered by meaningful tests; preserve existing calendar and Ramble paths.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

Implementation branch: `codex/keyboard-organization`; merged the latest integration tip `55ad637` before handoff. Organization routes/components live in `apps/web/components/organization` and Inbox/Home/projects/search pages. Persistence boundary is `projects/organization-actions.ts` plus existing task create/update ownership guards. Additive section migration is `drizzle/0007_dusty_albert_cleary.sql`, generated but not executed by the implementer.

Verification: red → green organization relationship checks, direct child inheritance, parent destination edits carrying children, and foreign project+parent bypass regression; authenticated organization action tests exercise actual action/read interfaces through database/session boundaries. Focused lint, web/DB typechecks, and full suite pass. Browser navigation/keyboard checks remain with lead integration verification. Existing full-app lint has the previously recorded composer/mobile hook failures.

Context: date sorting uses documented web D baseline; focused-task deadline has higher dispatcher priority once delivered. Mac Option+D/Option+N alternatives remain explicitly disputed in registry notes. Scoped task move/reveal/nest/unnest/collapse integrates the task provider; project commands are enabled by the mounted project route before task focus. Quick Find searches owned tasks/projects/sections and section links preserve project context.
