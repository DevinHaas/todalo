# 07: Full specification review and verification

Type: task
Status: claimed
Blocked by: 04, 05, 06

## What to build

Review full integration diff on standards and spec axes, fix all actionable findings, run combined tests/typecheck/lint/build where environment permits, exercise UI help/settings/task flows and record browser/platform/manual limitations honestly. Close all tickets with context pointers.

## Acceptance criteria

- [ ] Every researched command has an honest final coverage classification; no delivered personal feature is left planned.
- [ ] Combined automated checks and UI/manual verification outcomes are recorded without unsupported parity claims.
- [ ] Review findings fixed and all tracker tickets resolved with commits/tests/pointers.
- [ ] Implementer worktrees cleaned up and integration branch ready for user review.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

Claimed after full metadata merge `28a7316`: tickets 01–06 resolved, combined 23 files / 261 tests and web/database typechecks pass. Lead applied migrations 0006–0009. [Browser verification notes](/private/tmp/todalo-keyboard-browser-verification.md) contain live checks; final review must address the known form-submit, typography and React-key findings and distinguish existing lint/build environment limitations.
