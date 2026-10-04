# Tauri migration review

Base: `e6b21cb245574d50ce78fca1c59da97610c142f8`.
Ticket 1 review target: `bcaf034`.
Standards and spec were reviewed independently by separate agents using the code-review skill.

## Standards

No actionable findings. Existing workspace conventions, ownership predicates, label association scope, ordering and relevant ADRs are preserved. The capture server binds to loopback and the temporary capture route is removed on normal exit and interruption.

## Spec

Two P2 findings require repair:

1. Email registration in the legacy login screen was missing from the operation inventory. Registration is now explicitly included in ticket 2's proposal; the implementation and inventory must preserve and validate it.
2. The extracted Today count captured the default clock before asynchronous reads. A query spanning midnight could use the previous day's cutoff. Preserve the legacy clock timing and cover the pending-read midnight case.

The fixture-based PNG artifacts are real and reproducible; they are accurately distinguished from live authenticated route and Apple-device evidence. Broad native and release acceptance remains open.

Initial findings: Standards 0; Spec 2 P2. Repairs and follow-up verification pending.
