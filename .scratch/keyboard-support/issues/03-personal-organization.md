# 03: Inbox, projects, sections, search and task organization

Type: task
Status: resolved
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

## Answer

Organization implementation `9ca7cf6` integrated by merge `2f07788`. Working Inbox/Home/project/search routes, Quick Find, project sections/sorting, task move/reveal and nesting/expansion preserve task placement, bulk and nullable date semantics. [Authenticated organization action tests](../../../apps/web/app/(app)/projects/organization-actions.test.ts) and [relationship validation tests](../../../packages/db/src/task-organization-validation.test.ts) cover account boundaries, section/project ownership, parent inheritance and destination edits.

Integration verification: 17 test files / 242 tests pass; web and database typechecks pass. Implementer verified focused lint. Migration `0007_dusty_albert_cleary.sql` only creates sections, adds nullable `tasks.section_id`, constraints and index; no destructive statements. It is journaled with snapshot but not yet executed. Browser organization checks remain in ticket 07.
