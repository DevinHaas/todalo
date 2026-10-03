# 02: Focused task navigation, selection and editor actions

Type: task
Status: resolved
Blocked by: 01

## What to build

Deliver current-task keyboard support across active lists and boards: visible focus, repeatable J/K/arrows, keyboard multi-selection, completion/deletion, date choice/removal, details/actions, inline top/bottom creation and scoped save/dismiss/previous-next editor commands. Preserve Ramble, Quick Add and normal text/native/Tab behavior.

## Acceptance criteria

- [ ] Commands target visible focused/selected tasks, ignore destructive repeats and restore nearest useful focus.
- [ ] Todoist full inventory editor defaults distinguish macOS Control from Command and honor saved bindings.
- [ ] Selection toolbar is focusable, bulk completion/deletion work and menus/dialogs restore opener focus.
- [ ] Meaningful automated interactive dispatch/focus/editor tests pass; mark only working commands available.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

## Answer

Implemented in `5afc7db`, integrated by merge `0cc26a7`. Visible task focus, list/board navigation, keyboard selection, focused/bulk completion and deletion, date commands, details/menu commands, composer placement, and editor-scoped actions share effective saved bindings. [Task keyboard tests](../../../apps/web/lib/task-keyboard.test.ts) cover focus/selection policy, nearest remaining task, and dispatch action targeting.

Integration verification: 15 test files / 232 tests and web typecheck pass. Worker verified targeted lint; the three existing baseline lint errors persist. Organization integration must preserve null/bulk/placement task mutations and attach `OrganizationTaskActions` inside the task provider with Composer section identity. Browser interaction checks remain in ticket 07.
