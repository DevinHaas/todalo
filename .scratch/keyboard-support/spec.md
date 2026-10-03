Sources: [original approved design](../../docs/research/keyboard-support-design.md), [verified binding inventory](../../docs/research/todoist-keyboard-shortcuts-2026-10-03.md), and [help-panel reference](../../docs/research/assets/keyboard-shortcuts-help-reference-2026-10-03.png). Originals are preserved. Read the source inventory for every researched binding.

# Keyboard support specification

Status: approved for full implementation on October 3, 2026. Canonical tracker specification.

Research: [Todoist shortcut inventory](todoist-keyboard-shortcuts-2026-10-03.md), verified October 3, 2026, with official source links and unresolved documentation discrepancies.

## Accepted decisions

- Launch in the browser first. Structure the system so a future desktop application can reuse command definitions and preferences, with a separate adapter for desktop/global shortcuts.
- Sync personal shortcut preferences per authenticated account.
- Use Todoist defaults for existing and new supported personal task actions.
- Include missing personal task features needed for those actions. Collaboration and reporting are deferred.
- Display shortcut conflicts and require resolution before saving. Suggest an available alternative.
- Pause app-level shortcuts while users type in text fields. Preserve normal text editing and explicitly scoped editor actions, such as submitting the task being edited.
- Block combinations known to be unavailable because the browser or operating system reserves them. Browser applications cannot guarantee capture of every combination; maintain platform-specific restrictions and explain rejected bindings.
- Each action supports multiple bindings, disabling its shortcuts, restoring that action's defaults, and resetting all bindings to Todoist defaults.
- Provide searchable shortcut settings with key recording and a shortcut-help panel, opened by the default `?` binding. Display effective user bindings and suggest alternatives for conflicts.
- Match the produced character rather than the physical key position when users change keyboard layouts.
- Adapt ordinary Command/Control combinations between Mac and Windows automatically, with optional platform-specific overrides. Preserve explicitly platform-specific Todoist defaults.
- Deliver in stages so each stage can be reviewed and verified before expanding coverage.
- Quick Add text syntax is separate work. Do not add or customize tokens such as `p1`, `#project`, or `%label` in this feature.
- Customize keyboard-only commands. Modifier-click gestures and new mouse selection behavior are excluded for now.

## Current Todalo capabilities

Read-only codebase inspection found Today, Upcoming, and Settings routes; project data/actions exist without a project page. Search and Filters & Labels are disabled. No command palette exists.

Existing keyboard handling includes Cmd/Ctrl+B for the sidebar and Enter for task composition. Task rows expose individual controls but lack a shared focused-task state, keyboard row navigation, or multiselect. The board uses pointer-based dragging.

Account settings already have an authenticated database read/upsert pattern and a layout-mounted client provider. This is the recommended persistence pattern for user binding overrides.

Relevant files:

- `apps/web/components/ui/sidebar.tsx`
- `apps/web/components/tasks/task-composer.tsx`
- `apps/web/components/tasks/task-row.tsx`
- `apps/web/components/tasks/task-edit-dialog.tsx`
- `apps/web/components/tasks/board-view.tsx`
- `apps/web/components/app-sidebar.tsx`
- `apps/web/lib/settings.ts`
- `apps/web/app/(app)/settings/actions.ts`
- `apps/web/app/(app)/layout.tsx`
- `packages/db/src/schema.ts`

## Product behavior

### Shortcut settings and help

- Settings contains a searchable, categorized command list showing effective bindings, defaults, and whether an action is available in the current release.
- Users add or replace a binding by recording a single key, a simultaneous key combination, or a sequence. A recording session captures keys without triggering application commands or saving on Enter accidentally.
- Each action can have multiple bindings, have all its bindings disabled, or be reset. A separate reset-all control restores the platform's Todoist defaults.
- An empty override set means explicitly disabled. Absence of an override means use defaults. Saving unrelated settings must not re-enable disabled actions.
- Changes remain a draft until saved. Cancel discards the draft. Invalid draft bindings do not alter live behavior.
- Conflicts identify the other action and overlapping context. The interface suggests a free binding and offers an explicit way to edit or remove the conflicting assignment. Nothing is silently overwritten.
- Saving is blocked until every conflict and reserved-key error is resolved. Check both client-side and server-side.
- Help opens with the effective binding for the shortcut-help action, defaulting to `?`. It remains accessible from Settings even if its shortcut is disabled.
- Help, menus, and action hints show actual customized bindings from the same source as the dispatcher.
- Unimplemented actions are visibly unavailable and cannot be enabled; expose their bindings when their feature ships.

### Keyboard shortcut help panel

Visual reference: the user-provided Todoist screenshot, supplied October 3, 2026. Use its panel layout and shortcut presentation as the reference; command availability and bindings follow Todalo's command registry and the accepted scope above.

![Todoist keyboard shortcut help panel supplied by the user](assets/keyboard-shortcuts-help-reference-2026-10-03.png)

- On desktop, open a tall panel anchored to the right over a dimmed view of the current page. Use Todalo's theme colors, a neutral surface, a subtle border, and restrained rounding. Support both light and dark themes.
- Keep the header visible while the command list scrolls independently. Show the title **Keyboard Shortcuts**, a clearly labeled close button, and a link to shortcut settings for customization.
- Group actions under clear headings with thin separators, following the reference's compact rows. Use General, Navigation, Quick Add, and Task actions, adding project/calendar groups as their features ship. Avoid empty groups.
- Align action descriptions on the left and compact keycap badges on the right. Display simultaneous modifiers as adjacent keycaps, sequences with **then**, and alternate bindings with **or**. Long descriptions wrap without clipping the bindings.
- Show the current platform's effective saved bindings, including user overrides, rather than a static list of defaults. Use recognizable Command/Control and arrow labels with accessible spoken equivalents. Settings drafts do not change help until saved.
- The main list contains available commands with active bindings. Disabled actions remain discoverable in shortcut settings with a **Disabled** label; planned actions remain marked unavailable there. Do not copy the reference's native Desktop/window commands into the browser panel.
- Open the panel using the effective shortcut-help binding (default `?`) or a visible Keyboard Shortcuts entry in Settings and Help & resources. These entry points remain usable when the help shortcut is disabled.
- Treat the panel as an accessible modal dialog: give it a title, move focus to its close button on opening, contain Tab traversal within it while open, and suspend background task commands. Escape and the close button dismiss it and restore focus to the opener or previously focused task. Help must not open while typing or composing text.
- On narrow screens, use the available width, retain a reachable header/close control, and allow the list to scroll without horizontal overflow. Respect reduced-motion preferences for panel transitions.

### Dispatch and focus

- The focused editor, open dialog/menu, active task view, and focused/selected tasks determine which commands are eligible. Background views never handle commands.
- App-level shortcuts pause in inputs, textareas, editable content, and during IME composition. Editor-specific commands may run only in their own editor.
- Preserve standard browser/text editing and normal Tab focus traversal. Application shortcuts must not trap keyboard focus.
- Match characters rather than physical key locations. Preserve explicit modifiers and distinguish macOS Control from Command.
- Support Todoist's sequences, such as `G` then `T`, as well as simultaneous combinations. Use a proposed one-second interval between sequence steps; reset sequences on focus/context changes, Escape, composition, or an unrelated key. Todoist's exact timeout is undocumented, so this is a Todalo implementation choice, not a verified parity claim.
- Block ambiguous sequence-prefix bindings in overlapping contexts, for example standalone `G` alongside `G` then `T`. Different contexts can share a binding only where dispatch precedence is unambiguous.
- Ignore repeated keydown events for destructive commands. Task navigation may repeat while a navigation key is held.
- Completing or deleting a focused task leaves focus at the nearest remaining task or a useful list control. Closing a dialog restores focus to its opener.
- A focused task must be visibly identifiable. Keyboard task selection, including multi-selection, is independent of mouse gestures.

### Account and platform behavior

- Persist authenticated per-user overrides, with a versioned preferences shape and separate optional platform overrides. Never accept a caller-supplied account identity for ownership.
- Resolve bindings in this order: supported platform defaults, portable account overrides, then explicit platform overrides.
- Adapt ordinary primary-modifier combinations between Command on Mac and Control on Windows/Linux. Explicit Control defaults, including Todoist's macOS subtask commands, remain Control.
- Validate platform overrides and portable adaptations against the relevant platform's reservations and collisions. Explain where a binding cannot be used instead of silently dropping it.
- Load saved preferences after authentication. Saving propagates to the account's other active sessions and applies on subsequent visits. Surface save/sync errors and preserve the draft for retry.
- Validate the full effective binding set when new commands or changed defaults ship. A migration must never silently overwrite an existing custom binding; retain a safe previous effective configuration and surface conflicts for resolution.
- Maintain a conservative list of known unavailable browser/OS combinations. Some browser shortcuts can be handled by a page while others never reach it; do not reject a key solely because a browser also assigns an action to it.
- Future desktop support reuses the commands and preferences, adds a native adapter, and validates desktop/global reservations separately. Do not implement a desktop shell or global hooks now.

## Delivery stages

Each stage is reviewable on its own. A stage is complete only when its commands, customization, hints, and relevant keyboard flows pass the checks below. Staging does not remove the later agreed personal-feature scope.

| Stage | Deliverable | Representative defaults and coverage |
| --- | --- | --- |
| 1. Shortcut foundation and current actions | Shared command registry, browser dispatch, account persistence, settings/recording/help, conflicts and platform handling; task focus and keyboard selection for current views | `Q` task capture; `A` / `Shift+A` inline creation; `M` sidebar; `?` help; `G` then `T` / `U` for Today/Upcoming; `O` then `S` for Settings; `J`/`K` and arrows for task navigation; `E` completion; editor save/dismiss commands; date picker/removal; task actions and deletion where supported |
| 2. Personal navigation and organization | Inbox and project pages, task move/reveal, sections, Search/Quick Find, Home navigation, and project/list sorting | `/` or `F` search; Command/Control+`K` Quick Find; `G` then `I`, `P`, `H`, `/`; `H` Home; `V` move; `Shift+G` reveal in project; `S` section; `W` project menu; date/name sorting; nesting/unnesting and expanding subtasks |
| 3. Personal task metadata and filtering | Priority, labels and saved filters with working pages/editors; task descriptions/details, deadline editing, keyboard bulk operations and task links | `1`–`4`, `Y` priority; `L` labels; `G` then `L` / `V` navigation; priority sorting; documented deadline commands after resolving context conflicts; clipboard task URL commands; selection toolbar |
| 4. Remaining personal view/creation parity | Keyboard layout switching, Upcoming/calendar navigation, personal calendar view support, and documented file-paste task creation with the underlying feature support | `Shift+V` layout; Upcoming today/week movement; calendar today/week movement; paste-file task creation. Preserve existing calendar integrations while adding commands |

The full research inventory remains the binding reference, including platform-specific editor commands and alternate bindings omitted from the representative stage table. A command coverage matrix must track every researched action as available, planned for a stage, excluded, browser-native, or disputed. No command should be represented as working before its action exists.

### Scope exclusions

- Desktop global capture, global voice capture, show/hide windows, multiple windows, and pinning windows: future desktop work.
- Sharing, assignments, task/project comments, assignee sorting, notifications, productivity/reporting/insights: deferred beyond this personal-task feature.
- Quick Add syntax additions or token remapping, including text-only reminder/assignee tokens: separate work.
- Modifier-click completion/editing/selection gestures and new mouse selection behavior: excluded for now.
- Browser-native zoom, printing, history, and standard clipboard/text-editing controls remain available through their native behavior. Do not promise universal custom rebinding for commands the page cannot capture.
- Browser or OS combinations known to be unavailable cannot be selected as bindings.

## Approved implementation direction

- A shared command registry provides stable action IDs, descriptions, Todoist defaults, context, and availability.
- A browser adapter resolves key combinations and sequences against the active view, selected/focused tasks, dialogs, editors, and composition state.
- User preferences store overrides to binding sets, rather than duplicated defaults. Default changes require a migration/conflict strategy.
- All shortcut hints and help read the effective bindings so customization cannot leave stale labels.
- Binding validation checks same-context collisions, ambiguous sequence prefixes, and known reserved combinations. Distinct non-overlapping contexts may reuse keys when precedence is explicit.
- Task focus and selection are foundations for keyboard task actions. Keyboard support must also cover lists, boards, dialogs, and menus without trapping focus.
- Future desktop support adds a platform adapter and global/window commands without requiring a replacement command model.

## Acceptance and verification

### Every delivered stage

1. Each supported action has the verified Todoist web default(s), platform distinctions, and context recorded in the command coverage matrix. Keep research-disputed entries explicit until resolved.
2. Single keys, chords, sequences, alternate bindings, disabling, per-action reset, reset-all, and platform overrides work; labels update immediately after a successful save.
3. Draft conflicts and ambiguous prefixes block saving, identify the conflicting command, and offer a validated alternative. Reusing a key in non-overlapping contexts works predictably.
4. Reserved combinations are rejected with an explanation. Unknown capture limits are documented without claiming every accepted combination is guaranteed across browsers.
5. Typing, IME input, native text shortcuts, and focus traversal remain usable. Editor save shortcuts only affect the relevant editor.
6. Commands target the visible view and focused/selected task. Dialog/menu focus restores correctly, and keyboard selection works without mouse gestures.
7. Account persistence survives reload and works across the same user's sessions/devices. One account cannot read or overwrite another account's bindings. Save failures remain visible and retryable.
8. Verify Mac and Windows modifier behavior and at least one non-US keyboard layout. Cover browser-specific restrictions in the supported browsers.
9. Add meaningful automated tests for dispatch/context resolution, conflicts and prefixes, persistence/ownership, and interactive task/settings flows; perform manual keyboard checks for native/browser behaviors automation cannot faithfully reproduce.
10. Check the help panel against the supplied visual reference in light/dark themes and at desktop/mobile widths. Verify list scrolling, keycap alignment, accessible focus containment and restoration, Escape dismissal, and updated customized/platform bindings. Unsupported desktop commands must not appear as available browser actions.

### Research limitations

- The Todoist research contains contradictory platform entries. Documented web bindings are the initial baseline; disputed behavior must be verified or explicitly marked unresolved before claiming exact parity.
- Keyboard commands are in scope; Quick Add text syntax and keyboard-plus-mouse gestures are explicitly excluded above.
- Tests should cover dispatch by context, typing/IME suppression, sequences, conflict validation, account isolation/persistence, task focus/selection, and live shortcut hints.
- Browser reservations vary by browser and OS; a known-reservations list is a conservative check, not a guarantee that every accepted binding can be captured everywhere.

## Implementation authorization

The implementation request of October 3, 2026 authorizes the full agreed scope, including the help panel and all four stages. Earlier pending-confirmation language in the original source is superseded.

