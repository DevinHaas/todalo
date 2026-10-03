# 07: Full specification review and verification

Type: task
Status: resolved
Blocked by: 04, 05, 06

## What to build

Review full integration diff on standards and spec axes, fix all actionable findings, run combined tests/typecheck/lint/build where environment permits, exercise UI help/settings/task flows and record browser/platform/manual limitations honestly. Close all tickets with context pointers.

## Acceptance criteria

- [x] Every researched command has an honest final coverage classification; no delivered personal feature is left planned.
- [x] Combined automated checks and UI/manual verification outcomes are recorded without unsupported parity claims.
- [x] Review findings fixed and all tracker tickets resolved with commits/tests/pointers.
- [x] Implementer worktrees cleaned up and integration branch ready for user review.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

Claimed after full metadata merge `28a7316`. Lead applied migrations 0006–0009 and completed the browser checks; the final review addressed form submission, typography, React keys, platform defaults, stale task targeting/editor data, file paste, Quick Add arrow interception, and locale hydration.

## Answer

All four stages delivered. Review-fix commits `c9913a5` and `39fb0ba` are integrated by `6db97f6` and `61acdda`. Final 25 files / 272 tests and web/database typechecks pass after merging. Final isolated webpack production build passes; production browser project/help/direct-task/Today checks have zero errors or warnings. All 3 Standards and 4 Spec findings and additional browser findings are resolved. Three existing lint errors and physical keyboard/native clipboard/live calendar limits remain documented accurately.

All 120 researched entries are classified (73 available, 8 native, 38 excluded, 1 disputed); no personal feature remains planned. Test fixtures removed, preferences restored, isolated server stopped, and all seven implementer worktrees archived. The integration branch is ready for user review.

Pointers: [implementation report](../implementation-report.md), [verification](../verification.md), [separate review axes and resolutions](../review.md), [coverage](../../../docs/research/keyboard-command-coverage.md).
