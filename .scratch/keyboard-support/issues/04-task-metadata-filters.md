# 04: Priorities, labels, filters, descriptions and deadlines

Type: task
Status: resolved
Blocked by: 02, 03

## What to build

Deliver priorities/priority picker/sort, labels and saved filter pages/editors, descriptions/task details, deadline edit/clear including scoped Quick Add actions, clipboard URLs and keyboard bulk metadata operations. Add underlying personal feature support and secure persistence.

## Acceptance criteria

- [x] 1–4/Y/L and label/filter navigation defaults work; custom bindings/hints remain accurate.
- [x] Descriptions, deadlines, labels and saved filters persist per account and have working pages/editors.
- [x] Task URLs resolve to owned tasks; clipboard and selection toolbar bulk operations work.
- [x] Deadline-versus-sort context and Quick Add/editor conflict handling are explicit; tests cover ownership and user flows.

## Context

[Canonical specification](../spec.md). Original research and reference are linked there. The implementation request approves all four stages; no further start confirmation is required.

## Comments

## Answer

Integrated full `codex/keyboard-metadata` (`aa5bcb3`) with merge `28a7316`, preserving calendar/attachments. Priorities, labels, descriptions, deadlines, saved filter directories/results, owned task links, clipboard URL commands and selection-toolbar metadata operations now have working UI and authenticated persistence. Quick Add deadline commands run in their own editor; task metadata and project sort commands use registry context precedence and effective bindings/hints.

Verification: combined integration suite passes 23 files / 261 tests; full web/database typechecks pass; diff check passes. [Metadata action tests](../../../apps/web/app/(app)/tasks/metadata-actions.test.ts) cover ownership and batch validation, [metadata query tests](../../../apps/web/lib/task-metadata.test.ts) cover supported filter predicates, and [task URL tests](../../../apps/web/lib/task-url.test.ts) cover task-link behavior. Lint over all changed web files reports only previously recorded `react-hooks/set-state-in-effect` baseline failures in task-composer (now lines 77/622); other changed files pass.

The lead successfully applied migrations 0006–0009 to the configured development database. [Browser verification notes](/private/tmp/todalo-keyboard-browser-verification.md) record live flows, including file-paste task/attachment creation. Final two-axis review, form submit/typography/React key findings, remaining live checks and honest platform/browser limits belong to [ticket 07](07-integration-verification.md).
