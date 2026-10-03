# 01: Customizable shortcuts, account persistence and help

Type: task
Status: resolved
Blocked by: None

## What to build

Deliver the shared platform-aware command registry, safe browser dispatcher, account-owned persisted override sets, searchable shortcut settings with recording/conflict alternatives/resets, effective shortcut hints, and accessible help panel. Wire current general commands (capture, sidebar, help, Today/Upcoming/Settings, theme/help/account where supported). Read the complete spec and research inventory; coverage matrix must enumerate every researched action, including excluded/native/disputed items. Later-ticket commands remain unavailable until implemented.

## Acceptance criteria

- [ ] Shortcut preference save validates collisions, prefixes, platform reservations and ownership; defaults migrate safely without silently replacing customizations.
- [ ] Character-based chords/sequences support modifier distinctions, one-second reset, typing/IME/modal suppression and repeat policy.
- [ ] Settings support alternate bindings, disable, action/global resets, optional platform overrides, validated suggestions, visible retryable save errors.
- [ ] Help matches supplied panel reference, effective saved bindings, grouped keycaps, focus containment/restoration, narrow/light/dark/reduced-motion behavior, and visible Settings/Help entry points.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

## Answer

Implemented in `60f121c`, integrated by merge `a585293` on `codex/keyboard-support`. The shared registry, browser dispatcher, account-owned preference actions, settings recorder and validation, help panel, and current general commands are available. See [command coverage](../../../docs/research/keyboard-command-coverage.md) and [keyboard behavior tests](../../../apps/web/lib/keyboard.test.ts).

Integration verification: 14 test files / 228 tests and web typecheck pass; changed-file lint verified. Migration `drizzle/0006_keyboard_preferences.sql` subsequently applied successfully. Lead [browser verification](../verification.md) confirms focus containment/restoration, saved remap and reload, disabled visible entry, mobile/light/dark themes, and conflict/reservation explanations. Final typography, rounding and platform-default refinements are verified in [ticket 07](07-integration-verification.md); physical platform limits and research distinctions remain explicit.
